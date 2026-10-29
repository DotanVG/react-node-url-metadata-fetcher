// A gzip body followed by a socket close used to crash undici's HTTP/1 parser
// (assert(!this.paused) in Parser.finish) and take down the process. These
// cases must reject as handled errors, and a later request must still succeed.
const previousHatch = process.env.ALLOW_PRIVATE_ADDRESSES;
process.env.ALLOW_PRIVATE_ADDRESSES = 'true';

import http from 'node:http';
import zlib from 'node:zlib';

const { ERROR_CODES } = await import('../src/errors.js');
const { checkImage } = await import('../src/checkImage.js');
const { fetchPage } = await import('../src/fetchPage.js');

if (previousHatch === undefined) delete process.env.ALLOW_PRIVATE_ADDRESSES;
else process.env.ALLOW_PRIVATE_ADDRESSES = previousHatch;

const HANDLED_CODE = /^(NETWORK_ERROR|RESPONSE_TOO_LARGE|TIMEOUT)$/;

function cutGzip(socket, framing, body) {
    socket.on('error', () => {});
    socket.write(framing);
    socket.write(body, () => socket.destroy());
}

describe('truncated gzip responses', () => {
    let server;
    let origin;
    const crashes = [];
    const onException = (error) => crashes.push(error);
    const onRejection = (error) => crashes.push(error);

    beforeAll(async () => {
        process.on('uncaughtException', onException);
        process.on('unhandledRejection', onRejection);

        server = http.createServer((req, res) => {
            if (req.url === '/content-length-cut') {
                const body = zlib.gzipSync(
                    Buffer.from(`<html><title>cut</title>${'A'.repeat(64 * 1024)}`)
                );
                const part = body.subarray(0, 12);
                cutGzip(
                    req.socket,
                    `HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Encoding: gzip\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
                    part
                );
                return;
            }

            if (req.url === '/chunked-cut') {
                const body = zlib.gzipSync(
                    Buffer.from(`<html><title>chunk</title>${'B'.repeat(64 * 1024)}`)
                );
                const slice = body.subarray(0, 10);
                const chunk = Buffer.concat([
                    Buffer.from(`${slice.length.toString(16)}\r\n`),
                    slice,
                    Buffer.from('\r\n'),
                ]);
                cutGzip(
                    req.socket,
                    'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Encoding: gzip\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n',
                    chunk
                );
                return;
            }

            if (req.url === '/bomb') {
                // Compressed size is tiny; the inflated body is past the 2 MB cap.
                const raw = Buffer.concat([
                    Buffer.from('<html><head><title>bomb</title></head><body>'),
                    Buffer.alloc(3 * 1024 * 1024, 0x41),
                    Buffer.from('</body></html>'),
                ]);
                const body = zlib.gzipSync(raw);
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Content-Encoding': 'gzip',
                    'Content-Length': body.length,
                    Connection: 'close',
                });
                res.end(body);
                return;
            }

            if (req.url === '/image-cut') {
                const body = zlib.gzipSync(Buffer.from('not-an-image'.repeat(1000)));
                cutGzip(
                    req.socket,
                    `HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Encoding: gzip\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
                    body.subarray(0, 8)
                );
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><head><title>still here</title></head></html>');
        });

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        origin = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(async () => {
        process.off('uncaughtException', onException);
        process.off('unhandledRejection', onRejection);
        await new Promise((resolve) => {
            server.closeAllConnections?.();
            server.close(resolve);
        });
    });

    it('survives a content-length gzip body closed mid-stream', async () => {
        await expect(fetchPage(`${origin}/content-length-cut`)).rejects.toMatchObject({
            code: expect.stringMatching(HANDLED_CODE),
        });
    });

    it('survives a chunked gzip body closed mid-stream', async () => {
        await expect(fetchPage(`${origin}/chunked-cut`)).rejects.toMatchObject({
            code: expect.stringMatching(HANDLED_CODE),
        });
    });

    it('survives an oversized gzip bomb and reports a handled error', async () => {
        await expect(fetchPage(`${origin}/bomb`)).rejects.toMatchObject({
            code: ERROR_CODES.RESPONSE_TOO_LARGE,
        });
    });

    it('survives a truncated gzip body on the image probe', async () => {
        const result = await checkImage(`${origin}/image-cut`);
        expect(result.url).toBe(`${origin}/image-cut`);
        expect(crashes).toEqual([]);
    });

    it('still fetches a normal page afterwards', async () => {
        const page = await fetchPage(`${origin}/ok`);
        expect(page.html).toContain('still here');
        expect(crashes).toEqual([]);
    });
});
