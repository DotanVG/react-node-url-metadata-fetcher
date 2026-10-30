import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const envKeys = ['TRUST_PROXY_HOPS', 'RATE_LIMIT_MAX', 'RATE_LIMIT_EDGE_MAX',
    'RATE_LIMIT_WINDOW_MS', 'CLOUDFLARE_IP_RANGES', 'RATE_LIMIT_PROXY_DIAGNOSTICS'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    process.env.RATE_LIMIT_MAX = '10';
    process.env.RATE_LIMIT_EDGE_MAX = '2';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    jest.resetModules();
});

afterEach(() => {
    jest.restoreAllMocks();
    for (const key of envKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});

const post = (app, client, xff = '104.16.0.1') => request(app)
    .post('/fetch-metadata')
    .set('X-Forwarded-For', xff)
    .set('CF-Connecting-IP', client)
    .send({ urls: ['not a url'] });

describe('Cloudflare Sherlock re-QA', () => {
    it('runs the client limiter first so client rejections preserve other clients edge quota', async () => {
        process.env.RATE_LIMIT_MAX = '2';
        process.env.RATE_LIMIT_EDGE_MAX = '4';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        for (let i = 0; i < 2; i += 1) await post(app, '198.51.100.1').expect(200);
        for (let i = 0; i < 3; i += 1) await post(app, '198.51.100.1').expect(429);
        for (let i = 0; i < 2; i += 1) await post(app, '198.51.100.2').expect(200);
        // Four accepted requests used the edge quota; another client now hits it.
        await post(app, '198.51.100.3').expect(429);
    });

    it('preserves client standard headers on allowed requests and edge rejections with Retry-After', async () => {
        process.env.RATE_LIMIT_WINDOW_MS = '5000';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const allowed = await post(app, '198.51.100.1').expect(200);
        expect(allowed.headers.ratelimit).toMatch(/limit=10, remaining=9/);
        await post(app, '198.51.100.2').expect(200);
        const limited = await post(app, '198.51.100.3').expect(429);
        expect(limited.headers.ratelimit).toMatch(/limit=10, remaining=9/);
        expect(limited.headers['ratelimit-policy']).toBe('10;w=5');
        expect(limited.headers['retry-after']).toBe('5');
        expect(limited.body.error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 5 });
    });

    it.each([30, 60])('defaults the edge cap to 100 independently of client cap %i', async (limit) => {
        process.env.RATE_LIMIT_MAX = String(limit);
        delete process.env.RATE_LIMIT_EDGE_MAX;
        const { RATE_LIMIT_EDGE_MAX } = await import('../src/config.js');
        expect(RATE_LIMIT_EDGE_MAX).toBe(100);
    });

    it.each([0, 1, 2])('counts invalid CF headers at the matched edge with %i hops', async (hops) => {
        process.env.TRUST_PROXY_HOPS = String(hops);
        const { createApp } = await import('../src/app.js');
        const harness = express();
        harness.use((req, res, next) => {
            Object.defineProperty(req.socket, 'remoteAddress', {
                value: hops === 0 ? '104.16.0.1' : '10.0.0.1', configurable: true,
            });
            next();
        });
        harness.use(createApp());
        const chain = hops === 2 ? '104.16.0.1, 10.0.0.2' : '104.16.0.1';
        await post(harness, 'not-an-ip', chain).expect(200);
        await post(harness, '198.51.100.1', chain).expect(200);
        await post(harness, '198.51.100.2', chain).expect(429);
    });

    it('groups IPv6 edges by /56 and keeps the next subnet independent', async () => {
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        await post(app, '198.51.100.1', '2606:4700:abcd:1200::1').expect(200);
        await post(app, '198.51.100.2', '2606:4700:abcd:12ff::2').expect(200);
        await post(app, '198.51.100.3', '2606:4700:abcd:1201::3').expect(429);
        await post(app, '198.51.100.4', '2606:4700:abcd:1300::1').expect(200);
    });

    it('ignores rotating leftmost XFF spoof values when choosing the edge key', async () => {
        process.env.TRUST_PROXY_HOPS = '2';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const chain = (spoof, edge = '104.16.0.1') => `${spoof}, ${edge}, 10.0.0.2`;
        await post(app, '198.51.100.1', chain('203.0.113.1')).expect(200);
        await post(app, '198.51.100.2', chain('203.0.113.2')).expect(200);
        await post(app, '198.51.100.3', chain('203.0.113.3')).expect(429);
        await post(app, '198.51.100.4', chain('203.0.113.3', '173.245.48.1')).expect(200);
    });

    it('resets the edge quota at the configured window boundary, never earlier', async () => {
        process.env.RATE_LIMIT_WINDOW_MS = '5000';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const start = Date.now();
        const now = jest.spyOn(Date, 'now').mockReturnValue(start);
        await post(app, '198.51.100.1').expect(200);
        await post(app, '198.51.100.2').expect(200);
        now.mockReturnValue(start + 4999);
        await post(app, '198.51.100.3').expect(429);
        now.mockReturnValue(start + 5000);
        await post(app, '198.51.100.4').expect(200);
        await post(app, '198.51.100.5').expect(200);
        await post(app, '198.51.100.6').expect(429);
    });
});
