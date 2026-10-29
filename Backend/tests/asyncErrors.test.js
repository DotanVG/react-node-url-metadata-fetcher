import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../src/metadataService.js', () => ({
    fetchMetadataForUrls: jest.fn().mockRejectedValue(new Error('Upstream service failed')),
}));

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
});

it.each([
    [undefined, false], ['', false], ['production', false], ['staging', false],
    ['Development', false], ['TEST', false], ['development ', false],
    ['development\n', false], ['test\n', false], ['production\n', false],
    ['devel\u043epment', false], ['t\u0435st', false],
    ['development', true], ['test', true],
])('NODE_ENV=%p permits local CORS and detailed async errors: %p', async (nodeEnv, local) => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    jest.resetModules();
    const { createApp } = await import('../src/app.js');
    const app = createApp();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        for (const origin of ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173']) {
            const cors = await request(app).get('/health').set('Origin', origin);
            expect(cors.status).toBe(local ? 200 : 403);
            expect(cors.headers['access-control-allow-origin']).toBe(local ? origin : undefined);
        }
        await request(app).get('/health')
            .set('Origin', 'https://react-node-url-mdata-fetch-dotanv.netlify.app').expect(200);
        const response = await request(app)
            .post('/fetch-metadata')
            .send({ urls: ['https://example.com'] });
        expect(response.status).toBe(500);
        expect(response.body.error).toEqual({
            code: 'INTERNAL_ERROR',
            message: local ? 'Upstream service failed' : 'Something went wrong on our side. Please try again.',
        });
        expect(log).toHaveBeenCalledTimes(1);
    } finally {
        log.mockRestore();
    }
});
