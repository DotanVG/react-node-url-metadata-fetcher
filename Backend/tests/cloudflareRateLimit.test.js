import { jest } from '@jest/globals';
import request from 'supertest';

const envKeys = ['TRUST_PROXY_HOPS', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS',
    'CLOUDFLARE_IP_RANGES', 'RATE_LIMIT_PROXY_DIAGNOSTICS'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    process.env.RATE_LIMIT_MAX = '30';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    jest.resetModules();
});

afterEach(() => {
    for (const key of envKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
    jest.restoreAllMocks();
});

const post = (app, xff, client) => {
    const pending = request(app).post('/fetch-metadata');
    if (xff !== undefined) pending.set('X-Forwarded-For', xff);
    if (client !== undefined) pending.set('CF-Connecting-IP', client);
    // Invalid URLs exercise the complete limiter without outbound network calls.
    return pending.send({ urls: ['not a url'] });
};

async function expectBoundary(app, headers) {
    for (let index = 0; index < 30; index += 1) {
        await post(app, ...headers(index)).expect(200);
    }
    const limited = await post(app, ...headers(30)).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
}

describe('Cloudflare client rate-limit identity', () => {
    it('uses one bucket for the same client through six different Cloudflare edges', async () => {
        const { createApp } = await import('../src/app.js');
        const edges = ['173.245.48.1', '103.21.244.1', '141.101.64.1',
            '108.162.192.1', '162.158.0.1', '104.16.0.1'];
        await expectBoundary(createApp(), (i) => [
            `198.51.100.20, ${edges[i % edges.length]}`, '198.51.100.20',
        ]);
    });

    it('ignores varying spoofed leftmost XFF entries with a constant real chain', async () => {
        const { createApp } = await import('../src/app.js');
        await expectBoundary(createApp(), (i) => [
            `203.0.113.${i + 1}, 198.51.100.20, 104.16.0.1`, '198.51.100.20',
        ]);
    });

    it('ignores spoofed CF headers and Cloudflare-looking leftmost entries off the trusted boundary', async () => {
        const { createApp } = await import('../src/app.js');
        await expectBoundary(createApp(), (i) => [
            `104.16.0.1, 198.51.100.20`, `203.0.113.${i + 1}`,
        ]);
    });

    it('gives two genuine clients separate buckets even through the same edge', async () => {
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        await expectBoundary(app, () => ['104.16.0.1', '198.51.100.20']);
        await expectBoundary(app, () => ['104.16.0.1', '198.51.100.21']);
    });

    it.each([undefined, '', 'not-an-ip', '198.51.100.20, 198.51.100.21',
        '198.51.100.20:443', '[2001:db8::1]', '2001:db8::1%eth0'])
    ('falls back for missing or invalid CF-Connecting-IP %p', async (client) => {
        const { createApp } = await import('../src/app.js');
        await expectBoundary(createApp(), (i) => [`203.0.113.${i + 1}, 104.16.0.1`, client]);
    });

    it.each([1, 2, 3, 4, 5])('recognizes only the exact Cloudflare boundary at hop %i', async (hops) => {
        process.env.TRUST_PROXY_HOPS = String(hops);
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const suffix = Array.from({ length: hops - 1 }, (_, i) => `10.0.0.${i + 1}`);
        const xff = ['203.0.113.1', '104.16.0.1', ...suffix].join(', ');
        await expectBoundary(app, () => [xff, '198.51.100.20']);
        await post(app, xff, '198.51.100.21').expect(200);
    });

    it('does not accept a Cloudflare header from a shorter-than-configured chain', async () => {
        process.env.TRUST_PROXY_HOPS = '3';
        const { createApp } = await import('../src/app.js');
        await expectBoundary(createApp(), (i) => ['104.16.0.1', `203.0.113.${i + 1}`]);
    });

    it('ignores both spoofed headers with zero trusted hops on a non-Cloudflare socket', async () => {
        process.env.TRUST_PROXY_HOPS = '0';
        const { createApp } = await import('../src/app.js');
        await expectBoundary(createApp(), (i) => ['104.16.0.1', `203.0.113.${i + 1}`]);
    });

    it.each([true, false])('normalizes IPv4-mapped addresses on the CF/fallback path: %s', async (cloudflare) => {
        const { createApp } = await import('../src/app.js');
        const addresses = ['198.51.100.20', '::ffff:198.51.100.20', '::ffff:c633:6414'];
        await expectBoundary(createApp(), (i) => cloudflare
            ? ['104.16.0.1', addresses[i % addresses.length]]
            : [addresses[i % addresses.length], `203.0.113.${i + 1}`]);
    });

    it('recognizes IPv6 and mapped Cloudflare edges and groups IPv6 clients by /56', async () => {
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        const edges = ['2606:4700::1', '::ffff:104.16.0.1', '::ffff:6810:1'];
        const clients = ['2001:db8:abcd:1200::1', '2001:0db8:abcd:12ff:0:0:0:2'];
        await expectBoundary(app, (i) => [edges[i % edges.length], clients[i % clients.length]]);
        await post(app, edges[0], '2001:db8:abcd:1300::1').expect(200);
    });

    it('checks the actual socket with zero hops, never any supplied XFF entry', async () => {
        process.env.TRUST_PROXY_HOPS = '0';
        const { rateLimitKey } = await import('../src/rateLimitKey.js');
        const req = {
            socket: { remoteAddress: '104.16.0.1' }, ip: '104.16.0.1',
            get: (name) => name === 'CF-Connecting-IP' ? '198.51.100.20' : '203.0.113.1',
        };
        expect(rateLimitKey(req)).toBe('198.51.100.20');
        req.socket.remoteAddress = req.ip = '198.51.100.21';
        expect(rateLimitKey(req)).toBe('198.51.100.21');
    });

    it('rejects malformed trusted chain suffixes instead of authorizing a CF header', async () => {
        process.env.TRUST_PROXY_HOPS = '2';
        const { createApp } = await import('../src/app.js');
        await expectBoundary(createApp(), (i) => ['104.16.0.1, malformed', `203.0.113.${i + 1}`]);
    });

    it('uses the CIDR override as a replacement and supports both address families', async () => {
        process.env.CLOUDFLARE_IP_RANGES = '198.51.100.0/24, 2001:db8::/32';
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        await expectBoundary(app, (i) => [i % 2 ? '198.51.100.10' : '2001:db8::1', '203.0.113.1']);
        await post(app, '198.51.100.10', '203.0.113.2').expect(200);
        // The built-in ranges are no longer trusted when an override is set.
        await expectBoundary(app, (i) => ['104.16.0.1', `203.0.113.${i + 3}`]);
    });

    it.each(['', ' ', '104.16.0.1', 'not-a-cidr', '104.16.0.0/33',
        '2606:4700::/129', '104.16.0.0/-1', '104.16.0.0/13/2',
        '104.16.0.0/13,', 'fe80::1%eth0/64'])
    ('rejects invalid CIDR configuration %p without echoing it', async (value) => {
        process.env.CLOUDFLARE_IP_RANGES = value;
        await expect(import('../src/app.js')).rejects.toThrow(
            'CLOUDFLARE_IP_RANGES must be a nonempty comma-separated list of IPv4/IPv6 CIDRs.'
        );
    });

    it('keeps diagnostics off by default', async () => {
        const log = jest.spyOn(console, 'info').mockImplementation(() => {});
        const { createApp } = await import('../src/app.js');
        await post(createApp(), '104.16.0.1', '198.51.100.20').expect(200);
        expect(log).not.toHaveBeenCalled();
    });

    it('logs only XFF count and match boolean when diagnostics are explicitly enabled', async () => {
        process.env.RATE_LIMIT_PROXY_DIAGNOSTICS = 'true';
        const log = jest.spyOn(console, 'info').mockImplementation(() => {});
        const { createApp } = await import('../src/app.js');
        const app = createApp();
        await post(app, '198.51.100.20, 104.16.0.1', '198.51.100.20').expect(200);
        await post(app, '198.51.100.20', '198.51.100.21').expect(200);
        await request(app).get('/health').expect(200);
        expect(log.mock.calls).toEqual([
            ['rate-limit-proxy', { xffEntries: 2, cloudflareMatched: true }],
            ['rate-limit-proxy', { xffEntries: 1, cloudflareMatched: false }],
        ]);
    });
});
