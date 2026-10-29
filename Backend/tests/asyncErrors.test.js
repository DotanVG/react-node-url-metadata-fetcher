import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../src/metadataService.js', () => ({
    fetchMetadataForUrls: jest.fn().mockRejectedValue(new Error('Upstream service failed')),
}));

const { createApp } = await import('../src/app.js');

it('forwards async route rejections to the JSON error handler in Express 5', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const response = await request(createApp())
            .post('/fetch-metadata')
            .send({ urls: ['https://example.com'] });
        expect(response.status).toBe(500);
        expect(response.body.error).toEqual({
            code: 'INTERNAL_ERROR',
            message: 'Upstream service failed',
        });
        expect(log).toHaveBeenCalledTimes(1);
    } finally {
        log.mockRestore();
    }
});
