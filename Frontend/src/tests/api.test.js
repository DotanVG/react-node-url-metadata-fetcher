import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, fetchMetadata, pingHealth } from '../lib/api.js';

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    json: async () => body,
});

describe('api client', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
    afterEach(() => vi.unstubAllGlobals());

    describe('pingHealth', () => {
        it('resolves when the API answers', async () => {
            fetch.mockResolvedValue(jsonResponse({ status: 'ok' }));

            await expect(pingHealth()).resolves.toEqual({ status: 'ok' });
        });

        it('rejects on a non-2xx response', async () => {
            fetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));

            await expect(pingHealth()).rejects.toThrow(ApiError);
        });
    });

    describe('fetchMetadata', () => {
        it('posts the URL list as JSON', async () => {
            fetch.mockResolvedValue(
                jsonResponse({ results: [], summary: { requested: 0 } })
            );

            await fetchMetadata(['https://a.dev']);

            const [url, options] = fetch.mock.calls[0];
            expect(url).toMatch(/\/fetch-metadata$/);
            expect(options.method).toBe('POST');
            expect(JSON.parse(options.body)).toEqual({ urls: ['https://a.dev'] });
        });

        it('returns the parsed payload', async () => {
            const payload = {
                results: [{ url: 'https://a.dev', ok: true, title: 'A' }],
                summary: { requested: 1, succeeded: 1, failed: 0 },
            };
            fetch.mockResolvedValue(jsonResponse(payload));

            await expect(fetchMetadata(['https://a.dev'])).resolves.toEqual(payload);
        });

        it("surfaces the server's own error message", async () => {
            fetch.mockResolvedValue(
                jsonResponse(
                    { error: { code: 'RATE_LIMITED', message: 'Slow down.', retryAfterSeconds: 60 } },
                    { ok: false, status: 429 }
                )
            );

            const error = await fetchMetadata(['https://a.dev']).catch((e) => e);

            expect(error).toBeInstanceOf(ApiError);
            expect(error.message).toBe('Slow down.');
            expect(error.code).toBe('RATE_LIMITED');
            expect(error.retryAfterSeconds).toBe(60);
        });

        it('explains a network failure in terms of the cold start', async () => {
            fetch.mockRejectedValue(new TypeError('Failed to fetch'));

            const error = await fetchMetadata(['https://a.dev']).catch((e) => e);

            expect(error.code).toBe('NETWORK_ERROR');
            expect(error.message).toMatch(/waking up/i);
        });

        it('reports an abort as a timeout with advice to retry', async () => {
            const abort = new Error('aborted');
            abort.name = 'AbortError';
            fetch.mockRejectedValue(abort);

            const error = await fetchMetadata(['https://a.dev']).catch((e) => e);

            expect(error.code).toBe('TIMEOUT');
            expect(error.message).toMatch(/starting up/i);
        });

        it('rejects a response that is missing the results array', async () => {
            fetch.mockResolvedValue(jsonResponse({ unexpected: true }));

            const error = await fetchMetadata(['https://a.dev']).catch((e) => e);

            expect(error.code).toBe('MALFORMED_RESPONSE');
        });
    });
});
