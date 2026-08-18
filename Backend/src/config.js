// Central place for every tunable knob, so deployment targets only need env vars.

const int = (value, fallback) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const bool = (value, fallback) => {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const list = (value, fallback) =>
    value
        ? value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
        : fallback;

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_TEST = NODE_ENV === 'test';

export const PORT = int(process.env.PORT, 3000);

// Origins allowed to call the API from a browser. Requests without an `Origin`
// header (curl, server-to-server, health checks) are always allowed.
export const ALLOWED_ORIGINS = list(process.env.ALLOWED_ORIGINS, [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'https://react-node-url-mdata-fetch-dotanv.netlify.app',
]);

// Any origin matching one of these patterns is allowed too. Handy for Netlify
// deploy previews, which get a fresh subdomain per commit.
export const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/[a-z0-9-]+--react-node-url-mdata-fetch-dotanv\.netlify\.app$/i,
];

export const MAX_URLS_PER_REQUEST = int(process.env.MAX_URLS_PER_REQUEST, 20);

// Per-URL network budget. Render's free tier is slow, but a hung upstream
// should never hold a worker hostage.
export const FETCH_TIMEOUT_MS = int(process.env.FETCH_TIMEOUT_MS, 10_000);
export const MAX_HTML_BYTES = int(process.env.MAX_HTML_BYTES, 2 * 1024 * 1024);
export const MAX_REDIRECTS = int(process.env.MAX_REDIRECTS, 5);
export const FETCH_CONCURRENCY = int(process.env.FETCH_CONCURRENCY, 5);

export const RATE_LIMIT_WINDOW_MS = int(
    process.env.RATE_LIMIT_WINDOW_MS,
    60_000
);
export const RATE_LIMIT_MAX = int(process.env.RATE_LIMIT_MAX, 30);

// Escape hatch used by the test suite so it can point at a loopback fixture
// server. Never enable this in production: it re-opens the SSRF door.
export const ALLOW_PRIVATE_ADDRESSES = bool(
    process.env.ALLOW_PRIVATE_ADDRESSES,
    false
);

export const USER_AGENT =
    process.env.USER_AGENT ||
    'URLMetadataFetcher/2.0 (+https://github.com/DotanVG/react-node-url-metadata-fetcher)';
