// The test image server lives on loopback, so open the SSRF guard before the
// module under test reads its config.
process.env.ALLOW_PRIVATE_ADDRESSES = 'true';

import http from 'node:http';

const { checkImage, imageSize } = await import('../src/checkImage.js');

const png = (width, height) => {
    const buf = Buffer.alloc(33);
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(buf);
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
};

describe('imageSize', () => {
    it('reads PNG, GIF, JPEG and WebP headers', () => {
        expect(imageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });

        const gif = Buffer.from('474946383961' + '4001' + 'f000', 'hex');
        expect(imageSize(gif)).toEqual({ width: 320, height: 240 });

        // SOI, an empty APP0 segment, then SOF0 with height 630 and width 1200.
        const jpeg = Buffer.from(
            'ffd8' + 'ffe00002' + 'ffc00011' + '08' + '0276' + '04b0' + '03' + '00'.repeat(9),
            'hex'
        );
        expect(imageSize(jpeg)).toEqual({ width: 1200, height: 630 });

        const webp = Buffer.alloc(30);
        webp.write('RIFF', 0, 'latin1');
        webp.write('WEBPVP8X', 8, 'latin1');
        webp.writeUIntLE(1199, 24, 3);
        webp.writeUIntLE(629, 27, 3);
        expect(imageSize(webp)).toEqual({ width: 1200, height: 630 });
    });

    it('returns nulls for formats it does not parse', () => {
        expect(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual({
            width: null,
            height: null,
        });
    });
});

describe('checkImage', () => {
    let server;
    let origin;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            if (req.url === '/og.png') {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(Buffer.concat([png(1200, 630), Buffer.alloc(5000)]));
            } else if (req.url === '/moved.png') {
                res.writeHead(302, { Location: '/og.png' });
                res.end();
            } else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('nope');
            }
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(
        () =>
            new Promise((done) => {
                server.closeAllConnections?.();
                server.close(done);
            })
    );

    it('reports status, type, dimensions and weight, following redirects', async () => {
        expect(await checkImage(`${origin}/moved.png`)).toMatchObject({
            ok: true,
            status: 200,
            contentType: 'image/png',
            width: 1200,
            height: 630,
            bytes: 5033,
        });
    });

    it('reports a missing image without throwing', async () => {
        expect(await checkImage(`${origin}/gone.png`)).toMatchObject({ ok: false, status: 404 });
    });

    it('returns null when there is no image to check', async () => {
        expect(await checkImage('')).toBeNull();
    });
});
