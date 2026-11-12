export const MAX_URLS = 20;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOOKS_LIKE_DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/i;

export function normalizeUrl(input) {
    if (typeof input !== 'string') return null;

    const trimmed = input.trim().replace(/^<|>$/g, '');
    if (!trimmed) return null;

    const candidate = HAS_SCHEME.test(trimmed)
        ? trimmed
        : `https://${trimmed.replace(/^\/+/, '')}`;

    let url;
    try {
        url = new URL(candidate);
    } catch {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    // Require something that at least looks like a host name, so a stray word
    // does not silently become https://word/.
    const host = url.hostname;
    if (!host || (!host.includes('.') && host !== 'localhost')) return null;
    if (host.includes('.') && !LOOKS_LIKE_DOMAIN.test(host)) return null;

    url.hash = '';
    return url.href;
}

export const isValidUrl = (input) => normalizeUrl(input) !== null;

export function parseUrlList(input) {
    if (typeof input !== 'string') return { valid: [], invalid: [] };

    const tokens = input
        .split(/[\s,;]+/)
        .map((token) => token.trim())
        .filter(Boolean);

    const valid = [];
    const invalid = [];

    for (const token of tokens) {
        const normalized = normalizeUrl(token);
        if (normalized) {
            if (!valid.includes(normalized)) valid.push(normalized);
        } else {
            invalid.push(token);
        }
    }

    return { valid, invalid };
}

export function prettyUrl(url) {
    if (typeof url !== 'string') return '';
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function hostnameOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}
