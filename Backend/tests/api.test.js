// The fixture site lives on loopback, so the SSRF guard has to be opened up
// for this file only. Env must be set before the modules under test load,
// hence the dynamic imports.
process.env.ALLOW_PRIVATE_ADDRESSES = 'true';
process.env.FETCH_TIMEOUT_MS = '1500';
process.env.MAX_HTML_BYTES = '50000';
process.env.MAX_REDIRECTS = '2';
process.env.MAX_URLS_PER_REQUEST = '5';
process.env.RATE_LIMIT_MAX = '1000';

import request from 'supertest';

import { startFixtureServer } from './helpers/fixtureServer.js';

const { createApp } = await import('../src/app.js');
const { ERROR_CODES } = await import('../src/errors.js');

let app;
let fixture;

beforeAll(async () => {
    fixture = await startFixtureServer();
    app = createApp();
});

afterAll(async () => {
    await fixture.close();
});

const post = (urls) => request(app).post('/fetch-metadata').send({ urls });

describe('GET /health', () => {
    it('answers immediately so the frontend can warm a cold instance', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
        expect(typeof response.body.uptimeSeconds).toBe('number');
    });

    it('is also reachable at /healthz', async () => {
        await request(app).get('/healthz').expect(200);
    });
});

describe('GET /', () => {
    it('describes the API instead of returning "Cannot GET /"', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.body.name).toMatch(/URL Metadata Fetcher/);
        expect(response.body.endpoints).toHaveProperty('POST /fetch-metadata');
    });
});

describe('unknown routes', () => {
    it('return a JSON 404 that points at the docs route', async () => {
        const response = await request(app).get('/nope');

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
        expect(response.body.error.message).toMatch(/GET \//);
    });
});

describe('POST /fetch-metadata validation', () => {
    it('accepts a single URL because there is no minimum batch size', async () => {
        const response = await post([fixture.url('/bare')]);

        expect(response.status).toBe(200);
        expect(response.body.results).toHaveLength(1);
        expect(response.body.results[0].ok).toBe(true);
        expect(response.body.results[0].title).toBe('Bare Page');
    });

    it('rejects a missing "urls" key with an actionable message', async () => {
        const response = await request(app).post('/fetch-metadata').send({});

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/Missing "urls"/);
    });

    it('rejects a non-array "urls"', async () => {
        const response = await post('https://example.com');

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/must be an array/);
    });

    it('rejects an empty batch', async () => {
        const response = await post([]);

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/at least one URL/);
    });

    it('rejects batches over the configured maximum', async () => {
        const response = await post(Array(6).fill('https://example.com'));

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/at most 5/);
    });

    it('rejects non-string entries', async () => {
        const response = await post([fixture.url('/bare'), 42]);

        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/must be a string/);
    });

    it('rejects malformed JSON bodies', async () => {
        const response = await request(app)
            .post('/fetch-metadata')
            .set('Content-Type', 'application/json')
            .send('{"urls": [');

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_JSON');
    });
});

describe('POST /fetch-metadata results', () => {
    it('extracts the full metadata set from a rich page', async () => {
        const response = await post([fixture.url('/rich')]);
        const [result] = response.body.results;

        expect(result).toMatchObject({
            ok: true,
            status: 200,
            title: 'Rich Fixture Page',
            description: 'A page with a full set of Open Graph tags.',
            imageAlt: 'A hero image',
            siteName: 'Fixture Site',
            type: 'article',
            author: 'Ada Lovelace',
            locale: 'en_GB',
            themeColor: '#0f172a',
            publishedAt: '2024-05-01T10:00:00Z',
        });
        expect(result.image).toBe(fixture.url('/images/hero.png'));
        expect(result.favicon).toBe(fixture.url('/custom-icon.png'));
        expect(result.keywords).toEqual(['metadata', 'open graph', 'scraping']);
        expect(typeof result.elapsedMs).toBe('number');
    });

    it('falls back to Twitter Card tags and to JSON-LD', async () => {
        const response = await post([
            fixture.url('/twitter-only'),
            fixture.url('/json-ld'),
        ]);
        const [twitter, jsonLd] = response.body.results;

        expect(twitter.title).toBe('Twitter Card Title');
        expect(jsonLd.title).toBe('Structured Headline');
        expect(jsonLd.author).toBe('Grace Hopper');
    });

    it('preserves input order and summarises the batch', async () => {
        const response = await post([
            fixture.url('/bare'),
            fixture.url('/not-found'),
            fixture.url('/rich'),
        ]);

        expect(response.body.results.map((r) => r.title || r.error.code)).toEqual([
            'Bare Page',
            ERROR_CODES.HTTP_ERROR,
            'Rich Fixture Page',
        ]);
        expect(response.body.summary).toEqual({
            requested: 3,
            succeeded: 2,
            failed: 1,
        });
    });

    it('follows redirects and reports the final URL', async () => {
        const response = await post([fixture.url('/redirect-once')]);
        const [result] = response.body.results;

        expect(result.ok).toBe(true);
        expect(result.finalUrl).toBe(fixture.url('/bare'));
    });

    it('decodes non-UTF-8 pages using the declared charset', async () => {
        const response = await post([fixture.url('/latin1')]);

        expect(response.body.results[0].title).toBe('Café Crème');
    });
});

describe('POST /fetch-metadata per-URL errors', () => {
    const expectError = async (url, code) => {
        const response = await post([url]);
        const [result] = response.body.results;

        expect(response.status).toBe(200); // one bad link never fails the batch
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe(code);
        expect(result.error.message.length).toBeGreaterThan(10);
        return result;
    };

    it('reports an unparseable address', async () => {
        const result = await expectError('not a url', ERROR_CODES.INVALID_URL);
        expect(result.error.message).toMatch(/not a valid web address/);
    });

    it('reports an unsupported protocol', async () => {
        await expectError('file:///etc/passwd', ERROR_CODES.UNSUPPORTED_PROTOCOL);
    });

    it('reports HTTP failures with the status attached', async () => {
        const notFound = await expectError(
            fixture.url('/not-found'),
            ERROR_CODES.HTTP_ERROR
        );
        expect(notFound.error.status).toBe(404);
        expect(notFound.error.message).toMatch(/not found/i);

        const forbidden = await expectError(
            fixture.url('/forbidden'),
            ERROR_CODES.HTTP_ERROR
        );
        expect(forbidden.error.message).toMatch(/blocked our request/);

        const serverError = await expectError(
            fixture.url('/server-error'),
            ERROR_CODES.HTTP_ERROR
        );
        expect(serverError.error.message).toMatch(/server error/);
    });

    it('reports non-HTML responses', async () => {
        const result = await expectError(
            fixture.url('/image'),
            ERROR_CODES.UNSUPPORTED_CONTENT_TYPE
        );
        expect(result.error.message).toMatch(/an image/);
    });

    it('stops on a redirect loop', async () => {
        await expectError(fixture.url('/redirect'), ERROR_CODES.TOO_MANY_REDIRECTS);
    });

    it('refuses a redirect that points at cloud instance metadata', async () => {
        // ALLOW_PRIVATE_ADDRESSES opens up loopback for this suite, but never
        // link-local, so 169.254.169.254 is still refused.
        const result = await expectError(
            fixture.url('/redirect-to-private'),
            ERROR_CODES.BLOCKED_HOST
        );
        expect(result.error.message).toMatch(/private or internal address/);
    });

    it('refuses a redirect to a non-HTTP scheme', async () => {
        await expectError(
            fixture.url('/redirect-to-file-scheme'),
            ERROR_CODES.UNSUPPORTED_PROTOCOL
        );
    });

    it('stops downloading a page that exceeds the size cap', async () => {
        await expectError(fixture.url('/huge'), ERROR_CODES.RESPONSE_TOO_LARGE);
    });

    it('times out a slow page instead of hanging', async () => {
        const result = await expectError(fixture.url('/slow'), ERROR_CODES.TIMEOUT);
        expect(result.error.message).toMatch(/too long/);
    }, 10_000);

    it('reports an unresolvable domain as a DNS error', async () => {
        await expectError(
            'https://this-domain-really-does-not-exist.invalid',
            ERROR_CODES.DNS_ERROR
        );
    }, 15_000);
});

describe('CORS', () => {
    it('allows the deployed frontend origin', async () => {
        const response = await request(app)
            .get('/health')
            .set('Origin', 'https://react-node-url-mdata-fetch-dotanv.netlify.app');

        expect(response.headers['access-control-allow-origin']).toBe(
            'https://react-node-url-mdata-fetch-dotanv.netlify.app'
        );
    });

    it('allows Netlify deploy previews', async () => {
        const origin =
            'https://deploy-preview-12--react-node-url-mdata-fetch-dotanv.netlify.app';
        const response = await request(app).get('/health').set('Origin', origin);

        expect(response.headers['access-control-allow-origin']).toBe(origin);
    });

    it('rejects an unknown origin with a clear 403', async () => {
        const response = await request(app)
            .get('/health')
            .set('Origin', 'https://evil.example.com');

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('allows requests with no Origin header at all', async () => {
        await request(app).get('/health').expect(200);
    });
});
