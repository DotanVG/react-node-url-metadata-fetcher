import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import {
    ALLOWED_ORIGIN_PATTERNS,
    ALLOWED_ORIGINS,
    IS_PRODUCTION,
    MAX_URLS_PER_REQUEST,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
} from './config.js';
import { ERROR_CODES } from './errors.js';
import { fetchMetadataForUrls } from './metadataService.js';

const STARTED_AT = Date.now();

function isAllowedOrigin(origin) {
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function createApp() {
    const app = express();

    // Render/Netlify sit behind a proxy; trust it so rate limiting keys on the
    // real client IP instead of the load balancer's.
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(
        helmet({
            // This service returns JSON, never HTML, so the restrictive
            // cross-origin resource policy would only get in the browser's way.
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'none'"],
                    frameAncestors: ["'none'"],
                },
            },
        })
    );

    app.use(compression());

    app.use(
        cors({
            origin(origin, callback) {
                // No Origin header: curl, health checks, server-to-server.
                if (!origin || isAllowedOrigin(origin)) {
                    return callback(null, true);
                }
                return callback(new CorsError(origin));
            },
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type'],
            maxAge: 86_400,
        })
    );

    app.use(express.json({ limit: '100kb' }));

    // Health checks stay outside the limiter so the frontend's wake-up ping can
    // never lock a user out of the endpoint they are about to use.
    app.get(['/health', '/healthz'], (req, res) => {
        res.json({
            status: 'ok',
            uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/', (req, res) => {
        res.json({
            name: 'URL Metadata Fetcher API',
            version: 2,
            status: 'ok',
            endpoints: {
                'GET /health': 'Liveness probe, also used to wake the free-tier instance.',
                'POST /fetch-metadata': 'Body: { "urls": ["https://example.com"] }',
            },
            limits: {
                maxUrlsPerRequest: MAX_URLS_PER_REQUEST,
                requestsPerWindow: RATE_LIMIT_MAX,
                windowSeconds: Math.round(RATE_LIMIT_WINDOW_MS / 1000),
            },
            documentation:
                'https://github.com/DotanVG/react-node-url-metadata-fetcher',
        });
    });

    const limiter = rateLimit({
        windowMs: RATE_LIMIT_WINDOW_MS,
        limit: RATE_LIMIT_MAX,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
            res.status(429).json({
                error: {
                    code: 'RATE_LIMITED',
                    message: `You have made too many requests. Wait about ${retryAfter} seconds and try again.`,
                    retryAfterSeconds: retryAfter,
                },
            });
        },
    });

    app.post('/fetch-metadata', limiter, validateUrls, async (req, res, next) => {
        try {
            const results = await fetchMetadataForUrls(req.validUrls);
            res.json({
                results,
                summary: {
                    requested: results.length,
                    succeeded: results.filter((result) => result.ok).length,
                    failed: results.filter((result) => !result.ok).length,
                },
            });
        } catch (error) {
            next(error);
        }
    });

    app.use((req, res) => {
        res.status(404).json({
            error: {
                code: 'NOT_FOUND',
                message: `No route matches ${req.method} ${req.path}. See GET / for the available endpoints.`,
            },
        });
    });

    app.use(errorHandler);

    return app;
}

class CorsError extends Error {
    constructor(origin) {
        super(`Origin "${origin}" is not allowed to call this API.`);
        this.name = 'CorsError';
        this.status = 403;
        this.code = 'ORIGIN_NOT_ALLOWED';
    }
}

/**
 * Rejects malformed batches up front. Individual URLs are *not* rejected here:
 * a single bad link should come back as a per-URL error, not a 400 that hides
 * the results for every other link in the batch.
 */
function validateUrls(req, res, next) {
    const { urls } = req.body ?? {};

    if (urls === undefined) {
        return badRequest(
            res,
            'Missing "urls". Send a JSON body such as { "urls": ["https://example.com"] }.'
        );
    }

    if (!Array.isArray(urls)) {
        return badRequest(
            res,
            '"urls" must be an array of web addresses, for example { "urls": ["https://example.com"] }.'
        );
    }

    if (urls.length === 0) {
        return badRequest(
            res,
            'Add at least one URL before submitting.'
        );
    }

    if (urls.length > MAX_URLS_PER_REQUEST) {
        return badRequest(
            res,
            `You sent ${urls.length} URLs, but at most ${MAX_URLS_PER_REQUEST} can be processed in one request.`
        );
    }

    if (urls.some((url) => typeof url !== 'string')) {
        return badRequest(res, 'Every entry in "urls" must be a string.');
    }

    req.validUrls = urls.map((url) => url.trim());
    return next();
}

function badRequest(res, message) {
    return res.status(400).json({
        error: { code: ERROR_CODES.INVALID_URL, message },
    });
}

// The unused `next` is required: Express identifies error handlers by arity.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    if (err?.name === 'CorsError') {
        return res.status(403).json({
            error: { code: err.code, message: err.message },
        });
    }

    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: {
                code: 'INVALID_JSON',
                message: 'The request body was not valid JSON.',
            },
        });
    }

    if (err?.type === 'entity.too.large') {
        return res.status(413).json({
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'The request body is too large. Send fewer URLs.',
            },
        });
    }

    console.error('Unhandled error:', err);

    return res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: IS_PRODUCTION
                ? 'Something went wrong on our side. Please try again.'
                : err?.message || 'Unknown error',
        },
    });
}
