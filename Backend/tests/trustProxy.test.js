import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import request from 'supertest';

const originalHops = process.env.TRUST_PROXY_HOPS;
const originalLimit = process.env.RATE_LIMIT_MAX;
const backendDir = fileURLToPath(new URL('..', import.meta.url));
const configurationError = 'TRUST_PROXY_HOPS must be an integer from 0 to 5 (unset defaults to 1).';

const startServer = (env) => spawnSync(process.execPath, ['server.js'], {
    cwd: backendDir,
    // Do not inherit unrelated configuration or Node flags from the test runner.
    env: { NODE_ENV: 'test', ...env },
    encoding: 'utf8',
    timeout: 10_000,
});

beforeEach(() => {
    delete process.env.TRUST_PROXY_HOPS;
    process.env.RATE_LIMIT_MAX = '3';
    jest.resetModules();
});

afterEach(() => {
    if (originalHops === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = originalHops;
    if (originalLimit === undefined) delete process.env.RATE_LIMIT_MAX;
    else process.env.RATE_LIMIT_MAX = originalLimit;
});

const post = (app, xff) => request(app)
    .post('/fetch-metadata')
    .set('X-Forwarded-For', xff)
    .send({ urls: ['not a url'] });

describe('TRUST_PROXY_HOPS', () => {
    it('preserves the one-hop default when unset', async () => {
        const { createApp } = await import('../src/app.js');
        expect(createApp().get('trust proxy')).toBe(1);
    });

    it.each(['0', '1', '2', '3', '4', '5'])('accepts %s as a numeric hop count', async (value) => {
        process.env.TRUST_PROXY_HOPS = value;
        const { createApp } = await import('../src/app.js');
        expect(createApp().get('trust proxy')).toBe(Number(value));
    });

    it.each(['', ' ', '\t', '\r\n', ' \t\r\n ', '-1', '6', '100', '1.5', '1x', '01', '+1', '1e0', '0x1',
        'true', 'false', ' 1', '1 ', '1\n', '\n1', '\uff11', 'NaN', 'Infinity'])
    ('rejects invalid configuration %p with one clean error line', (value) => {
        const result = startServer({ TRUST_PROXY_HOPS: value });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stderr.split(/\r?\n/)).toEqual([configurationError, '']);
        expect(result.stdout).toBe('');
    });

    it('exits unsuccessfully with a clear startup error for invalid configuration', () => {
        const sentinel = 'BQ03_INVALID_VALUE_MUST_NOT_APPEAR';
        const result = startServer({ TRUST_PROXY_HOPS: sentinel });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/TRUST_PROXY_HOPS must be an integer from 0 to 5/);
        expect(result.stderr).not.toContain(sentinel);
        expect(result.stdout).not.toContain('listening on port');
    });

    it('exits with code 1 and reports EADDRINUSE when its port is occupied', async () => {
        const occupied = createServer();
        try {
            await new Promise((resolve, reject) => {
                occupied.once('error', reject);
                occupied.listen(0, resolve);
            });
            const result = startServer({ PORT: String(occupied.address().port), TRUST_PROXY_HOPS: '1' });
            expect(result.error).toBeUndefined();
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/^Error: listen EADDRINUSE\b/m);
            expect(result.stdout).not.toContain('listening on port');
        } finally {
            if (occupied.listening) await new Promise((resolve) => occupied.close(resolve));
        }
    }, 15_000);

    it.each([1, 2, 3, 4, 5])('keys on the %ith-from-right XFF entry', async (hops) => {
        process.env.TRUST_PROXY_HOPS = String(hops);
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const header = (attempt, client = '8.8.8.8') => {
            const entries = Array.from({ length: 6 }, (_, index) => `1.1.${attempt}.${index + 1}`);
            entries[entries.length - hops] = client;
            return entries.join(', ');
        };

        // Every other XFF entry changes, including ones on both sides of the key.
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            await post(app, header(attempt)).expect(200);
        }
        await post(app, header(4)).expect(429);
        await post(app, header(5, '9.9.9.9')).expect(200);
    });

    it('ignores XFF and shares the socket-address bucket with zero hops', async () => {
        process.env.TRUST_PROXY_HOPS = '0';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        for (let i = 1; i <= 3; i += 1) await post(app, `8.8.8.${i}`).expect(200);
        await post(app, '9.9.9.9').expect(429);
    });

    it('trusts no addresses at zero hops without the boolean-false ERL warning', async () => {
        process.env.TRUST_PROXY_HOPS = '0';
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const { createApp } = await import('../src/app.js');
            const app = createApp();
            const trust = app.get('trust proxy fn');
            for (const address of ['127.0.0.1', '8.8.8.8', '::1']) {
                for (const hop of [0, 1, 5]) expect(trust(address, hop)).toBe(false);
            }
            await post(app, '8.8.8.8').expect(200);
            // express-rate-limit 8 checks `trust proxy === false`; numeric 0
            // compiles to trust-nothing in Express but does not enter that warning path.
            expect(error).not.toHaveBeenCalled();
        } finally {
            error.mockRestore();
        }
    });

    it('cannot evade the default limiter by spoofing the leftmost XFF entry (F3)', async () => {
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        for (const leftmost of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
            await post(app, `${leftmost}, 8.8.8.8`).expect(200);
        }
        const limited = await post(app, '4.4.4.4, 8.8.8.8').expect(429);
        expect(limited.body.error.code).toBe('RATE_LIMITED');
        expect(limited.headers['retry-after']).toBeDefined();
        await post(app, '4.4.4.4, 9.9.9.9').expect(200);
    });
});
