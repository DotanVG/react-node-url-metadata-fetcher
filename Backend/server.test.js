// Exercises the real server entry (the module that listens), against the
// in-process fixture. The legacy CSRF / live-network cases were replaced:
// this API has no CSRF token, and the suite must not depend on the network.
const previousEnv = {
    ALLOW_PRIVATE_ADDRESSES: process.env.ALLOW_PRIVATE_ADDRESSES,
    PORT: process.env.PORT,
    FETCH_TIMEOUT_MS: process.env.FETCH_TIMEOUT_MS,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
};

process.env.ALLOW_PRIVATE_ADDRESSES = 'true';
process.env.PORT = '38765';
process.env.FETCH_TIMEOUT_MS = '1500';
process.env.RATE_LIMIT_MAX = '1000';

import request from 'supertest';

import { startFixtureServer } from './tests/helpers/fixtureServer.js';

const { app, server } = await import('./server.js');

for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
}

let fixture;

beforeAll(async () => {
    fixture = await startFixtureServer();
    if (!server.listening) {
        await new Promise((resolve) => server.once('listening', resolve));
    }
});

afterAll(async () => {
    await fixture.close();
    await new Promise((resolve) => server.close(resolve));
});

describe('server entry', () => {
    it('answers GET /health', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
    });

    it('fetches metadata for a fixture page', async () => {
        const response = await request(app)
            .post('/fetch-metadata')
            .send({ urls: [fixture.url('/bare')] });

        expect(response.status).toBe(200);
        expect(response.body.results).toHaveLength(1);
        expect(response.body.results[0]).toMatchObject({
            ok: true,
            title: 'Bare Page',
        });
    });

    it('reports a blocked host as a per-URL error', async () => {
        const response = await request(app)
            .post('/fetch-metadata')
            .send({ urls: ['http://169.254.169.254/latest/meta-data/'] });

        expect(response.status).toBe(200);
        expect(response.body.results[0].ok).toBe(false);
        expect(response.body.results[0].error.code).toBe('BLOCKED_HOST');
    });

    it('rejects an empty URL list', async () => {
        const response = await request(app).post('/fetch-metadata').send({ urls: [] });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_URL');
    });

    it('rejects a body that is missing urls', async () => {
        const response = await request(app)
            .post('/fetch-metadata')
            .send({ invalidKey: 'invalid data' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
    });
});
