// Central place for every tunable knob, so deployment targets only need env vars.

const int = (value, fallback) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const bool = (value, fallback) => {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const proxyHops = (value) => {
    if (value === undefined) return 1;
    if (!['0', '1', '2', '3', '4', '5'].includes(value)) {
        throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5 (unset defaults to 1).');
    }
    return Number(value);
};

const list = (value, fallback) =>
    value
        ? value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
        : fallback;

export const NODE_ENV = process.env.NODE_ENV;
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_TEST = NODE_ENV === 'test';
// Only explicit local environments may enable development conveniences.
export const IS_DEV_OR_TEST = NODE_ENV === 'development' || IS_TEST;

export const PORT = int(process.env.PORT, 3000);
export const TRUST_PROXY_HOPS = proxyHops(process.env.TRUST_PROXY_HOPS);
export const CLOUDFLARE_IP_RANGES = process.env.CLOUDFLARE_IP_RANGES;
export const RATE_LIMIT_PROXY_DIAGNOSTICS = bool(process.env.RATE_LIMIT_PROXY_DIAGNOSTICS, false);

// Origins allowed to call the API from a browser. Requests without an `Origin`
// header (curl, server-to-server, health checks) are always allowed.
// Loopback dev servers require an explicit dev/test environment; set ALLOWED_ORIGINS
// explicitly when a deployment needs a different list.
const DEV_ORIGINS = IS_DEV_OR_TEST
    ? ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173']
    : [];

export const ALLOWED_ORIGINS = list(process.env.ALLOWED_ORIGINS, [
    ...DEV_ORIGINS,
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
// The og:image probe gets its own, shorter budget so it cannot double a slow page.
export const IMAGE_TIMEOUT_MS = int(process.env.IMAGE_TIMEOUT_MS, 5_000);
export const MAX_HTML_BYTES = int(process.env.MAX_HTML_BYTES, 2 * 1024 * 1024);
export const MAX_REDIRECTS = int(process.env.MAX_REDIRECTS, 5);
export const FETCH_CONCURRENCY = int(process.env.FETCH_CONCURRENCY, 5);

export const RATE_LIMIT_WINDOW_MS = int(
    process.env.RATE_LIMIT_WINDOW_MS,
    60_000
);
export const RATE_LIMIT_MAX = int(process.env.RATE_LIMIT_MAX, 30);
// Shared by clients using one matched Cloudflare edge; keep it coarser by default.
export const RATE_LIMIT_EDGE_MAX = int(process.env.RATE_LIMIT_EDGE_MAX, 100);

// Local-dev hatch for the in-process fixture. It permits loopback, RFC1918,
// carrier-grade NAT, and non-standard ports. Requires an explicit development
// or test NODE_ENV; unset and unknown values fail closed. Link-local, metadata,
// multicast, and other always-blocked ranges stay closed either way.
export const ALLOW_PRIVATE_ADDRESSES =
    IS_DEV_OR_TEST &&
    bool(process.env.ALLOW_PRIVATE_ADDRESSES, false);

export const USER_AGENT =
    process.env.USER_AGENT ||
    'URLMetadataFetcher/2.0 (+https://github.com/DotanVG/react-node-url-metadata-fetcher)';
