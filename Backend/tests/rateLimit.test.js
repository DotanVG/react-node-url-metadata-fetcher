// Isolated from api.test.js so a low limit does not interfere with it.
process.env.ALLOW_PRIVATE_ADDRESSES = 'true';
process.env.RATE_LIMIT_MAX = '3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

import request from 'supertest';

const { createApp } = await import('../src/app.js');

describe('rate limiting', () => {
    const app = createApp();

    it('limits /fetch-metadata and explains when to retry', async () => {
        const send = () =>
            request(app).post('/fetch-metadata').send({ urls: ['not a url'] });

        const responses = [];
        for (let i = 0; i < 5; i += 1) {
            responses.push(await send());
        }

        const limited = responses.filter((r) => r.status === 429);
        expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 429, 429]);
        expect(limited[0].headers.ratelimit).toMatch(/limit=3/);
        expect(limited[0].headers['retry-after']).toBeDefined();
        expect(limited[0].body.error.code).toBe('RATE_LIMITED');
        expect(limited[0].body.error.retryAfterSeconds).toBe(60);
        expect(limited[0].body.error.message).toMatch(/too many requests/i);
    });

    it('groups addresses in the same IPv6 /56 while keeping other subnets independent', async () => {
        const ipv6App = createApp();
        const send = (ip) => request(ipv6App)
            .post('/fetch-metadata')
            .set('X-Forwarded-For', ip)
            .send({ urls: ['not a url'] });

        for (const ip of ['2001:4860:abcd:1200::1', '2001:4860:abcd:1201::2', '2001:4860:abcd:12ff::3']) {
            await send(ip).expect(200);
        }
        await send('2001:4860:abcd:1202::4').expect(429);
        await send('2001:4860:abcd:1300::1').expect(200);
    });

    it('leaves /health unlimited so wake-up pings always work', async () => {
        for (let i = 0; i < 8; i += 1) {
            await request(app).get('/health').expect(200);
        }
    });
});
