import { spawnSync } from 'node:child_process';
import { jest } from '@jest/globals';
import request from 'supertest';

const originalHops = process.env.TRUST_PROXY_HOPS;
const originalLimit = process.env.RATE_LIMIT_MAX;

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

    it.each(['', '-1', '6', '100', '1.5', '1x', '01', '+1', '1e0', '0x1',
        'true', 'false', ' 1', '1 ', '1\n', '\n1', '\uff11', 'NaN', 'Infinity'])
    ('rejects invalid configuration %p', async (value) => {
        process.env.TRUST_PROXY_HOPS = value;
        await expect(import('../src/app.js')).rejects.toThrow(
            /TRUST_PROXY_HOPS must be an integer from 0 to 5/
        );
    });

    it('exits unsuccessfully with a clear startup error for invalid configuration', () => {
        const result = spawnSync(process.execPath, ['server.js'], {
            cwd: process.cwd(),
            env: { ...process.env, TRUST_PROXY_HOPS: 'true' },
            encoding: 'utf8',
            timeout: 10_000,
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/TRUST_PROXY_HOPS must be an integer from 0 to 5/);
        expect(result.stdout).not.toContain('listening on port');
    });

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
