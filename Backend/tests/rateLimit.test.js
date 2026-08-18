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
        expect(limited.length).toBeGreaterThan(0);
        expect(limited[0].body.error.code).toBe('RATE_LIMITED');
        expect(limited[0].body.error.retryAfterSeconds).toBe(60);
        expect(limited[0].body.error.message).toMatch(/too many requests/i);
    });

    it('leaves /health unlimited so wake-up pings always work', async () => {
        for (let i = 0; i < 8; i += 1) {
            await request(app).get('/health').expect(200);
        }
    });
});
