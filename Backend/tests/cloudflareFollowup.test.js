import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const envKeys = ['TRUST_PROXY_HOPS', 'RATE_LIMIT_MAX', 'RATE_LIMIT_EDGE_MAX',
    'RATE_LIMIT_WINDOW_MS', 'CLOUDFLARE_IP_RANGES', 'RATE_LIMIT_PROXY_DIAGNOSTICS'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    jest.resetModules();
});

afterEach(() => {
    for (const key of envKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});

// Only the test harness can substitute a socket peer; production has no such header.
function withPeer(app, peer) {
    const harness = express();
    harness.use((req, res, next) => {
        Object.defineProperty(req.socket, 'remoteAddress', { value: peer, configurable: true });
        next();
    });
    harness.use(app);
    return harness;
}

const post = (app, xff, client) => request(app).post('/fetch-metadata')
    .set('X-Forwarded-For', xff)
    .set('CF-Connecting-IP', client)
    .send({ urls: ['not a url'] });

describe('Cloudflare QA follow-ups', () => {
    it.each([0, 1, 2])('caps rotating valid client headers at the matched edge with %i hops', async (hops) => {
        process.env.TRUST_PROXY_HOPS = String(hops);
        process.env.RATE_LIMIT_MAX = '2';
        process.env.RATE_LIMIT_EDGE_MAX = '5';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const edge = '104.16.0.1';
        const peer = hops === 0 ? edge : '10.0.0.1';
        const harness = withPeer(app, peer);
        const chain = (boundary) => hops === 2 ? `${boundary}, 10.0.0.2` : boundary;
        const statuses = [];
        let limited;
        for (let i = 1; i <= 6; i += 1) {
            limited = await post(harness, chain(edge), `198.51.100.${i}`);
            statuses.push(limited.status);
        }
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
        expect(limited.body.error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 60 });
        expect(limited.headers['retry-after']).toBeDefined();
        expect(limited.headers.ratelimit).toMatch(/limit=2/);

        // A different matched edge has its own coarse quota, even behind one socket.
        const other = withPeer(app, hops === 0 ? '173.245.48.1' : peer);
        await post(other, chain('173.245.48.1'), '198.51.100.7').expect(200);
        for (const path of ['/health', '/healthz']) await request(harness).get(path).expect(200);

        // Non-CF traffic bypasses the coarse limiter. Invalid CF headers still
        // use req.ip for the client quota and count toward a matched edge quota.
        for (let i = 1; i <= 6; i += 1) {
            const direct = withPeer(app, hops === 0 ? `203.0.113.${i}` : peer);
            await post(direct, chain(`203.0.113.${i}`), `192.0.2.${i}`).expect(200);
        }
        const invalid = withPeer(createApp(), peer);
        await post(invalid, chain(edge), 'garbage-a').expect(200);
        await post(invalid, chain(edge), 'garbage-b').expect(200);
        await post(invalid, chain(edge), 'garbage-c').expect(429);
    });

    it('pins every embedded Cloudflare IPv4 and IPv6 CIDR exactly', async () => {
        const { DEFAULT_CLOUDFLARE_IP_RANGES } = await import('../src/rateLimitKey.js');
        // Deliberately independent literal: omissions and wider prefixes must fail.
        expect(DEFAULT_CLOUDFLARE_IP_RANGES).toEqual([
            '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
            '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
            '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
            '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
            '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
            '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
        ]);
    });

    it.each([0, 1])('puts different invalid CF headers in req.ip fallback bucket with %i hops', async (hops) => {
        process.env.TRUST_PROXY_HOPS = String(hops);
        const { rateLimitKey } = await import('../src/rateLimitKey.js');
        const invalid = ['garbage-a', 'garbage-b', '198.51.100.20:443',
            '[2001:db8::1]', '2001:db8::1%eth0', '198.51.100.20, 198.51.100.21'];
        const peers = ['104.16.0.1', '173.245.48.1', '103.21.244.1',
            '108.162.192.1', '162.158.0.1', '141.101.64.1'];
        // Unit-level req.ip is fixed to distinguish req.ip from peer/header fallback.
        const keys = invalid.map((client, i) => rateLimitKey({
            ip: '203.0.113.20',
            socket: { remoteAddress: peers[i] },
            get: (name) => name === 'CF-Connecting-IP' ? client : '104.16.0.1',
        }));
        expect(keys).toEqual(Array(invalid.length).fill('203.0.113.20'));
    });
});
