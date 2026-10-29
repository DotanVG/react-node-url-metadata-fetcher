// The fixture port is ephemeral, so this file opens the local-dev hatch before
// the modules under test load. Metadata addresses stay blocked anyway.
process.env.ALLOW_PRIVATE_ADDRESSES = 'true';

import dns from 'node:dns/promises';
import http from 'node:http';
import { jest } from '@jest/globals';

const { fetchPublic } = await import('../src/fetchPage.js');
const { ERROR_CODES } = await import('../src/errors.js');

describe('connect-time lookup on each hop', () => {
    let server;
    let port;
    let hits;

    beforeAll(async () => {
        hits = [];
        server = http.createServer((req, res) => {
            hits.push(req.url);
            if (req.url === '/hop') {
                res.writeHead(302, {
                    Location: `http://next.example:${port}/landed`,
                });
                res.end();
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><title>landed</title></html>');
        });

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                resolve();
            });
        });
    });

    afterAll(
        () =>
            new Promise((resolve) => {
                server.closeAllConnections?.();
                server.close(resolve);
            })
    );

    afterEach(() => {
        hits = [];
        jest.restoreAllMocks();
    });

    it('connects to the address returned by the vetted lookup', async () => {
        jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

        const { response } = await fetchPublic(`http://rebind.example:${port}/page`, {
            headers: {},
            signal: AbortSignal.timeout(2000),
        });

        expect(await response.text()).toContain('landed');
        expect(hits).toEqual(['/page']);
    });

    it('refuses a redirect hop whose second lookup returns a metadata address', async () => {
        const calls = new Map();
        jest.spyOn(dns, 'lookup').mockImplementation(async (hostname) => {
            const seen = (calls.get(hostname) ?? 0) + 1;
            calls.set(hostname, seen);
            if (hostname === 'next.example' && seen > 1) {
                return [{ address: '169.254.169.254', family: 4 }];
            }
            return [{ address: '127.0.0.1', family: 4 }];
        });

        await expect(
            fetchPublic(`http://rebind.example:${port}/hop`, {
                headers: {},
                signal: AbortSignal.timeout(2000),
            })
        ).rejects.toMatchObject({ code: ERROR_CODES.BLOCKED_HOST });

        expect(hits).toEqual(['/hop']);
        expect(calls.get('next.example')).toBeGreaterThanOrEqual(2);
    });

    it('follows a redirect when every hop stays on the vetted address', async () => {
        jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

        const { response } = await fetchPublic(`http://rebind.example:${port}/hop`, {
            headers: {},
            signal: AbortSignal.timeout(2000),
        });

        expect(await response.text()).toContain('landed');
        expect(hits).toEqual(['/hop', '/landed']);
    });
});
