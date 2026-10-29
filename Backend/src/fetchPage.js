import dns from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';

import {
    FETCH_TIMEOUT_MS,
    MAX_HTML_BYTES,
    MAX_REDIRECTS,
    USER_AGENT,
} from './config.js';
import {
    describeHttpStatus,
    ERROR_CODES,
    MetadataError,
    toMetadataError,
} from './errors.js';
import { assertPublicUrl, isBlockedAddress, parseUrl } from './urlSafety.js';

/**
 * Resolves at connect time, checks every answer against the same blocklist
 * assertPublicUrl uses, and hands the socket exactly one vetted address.
 * undici would otherwise resolve again after the pre-check and could be
 * pointed at a private address by a rebinding DNS server.
 */
function pinnedLookup(hostname, options, callback) {
    dns.lookup(hostname, { all: true, verbatim: true })
        .then((addresses) => {
            const vetted = Array.isArray(addresses)
                ? addresses.filter((entry) => !isBlockedAddress(entry.address))
                : [];
            if (vetted.length === 0 || vetted.length !== addresses.length) {
                callback(
                    new MetadataError(
                        ERROR_CODES.BLOCKED_HOST,
                        `"${hostname}" points to a private or internal address, which this service will not fetch.`
                    )
                );
                return;
            }

            if (options?.all) {
                callback(null, vetted);
                return;
            }

            const family = typeof options === 'object' ? options.family : options;
            const chosen =
                family === 4 || family === 6
                    ? (vetted.find((entry) => entry.family === family) ?? vetted[0])
                    : vetted[0];
            callback(null, chosen.address, chosen.family);
        })
        .catch((error) => callback(error));
}

// One agent for the process. Every hop, including redirects and image probes,
// connects through pinnedLookup, so a later lookup cannot swap in a private
// address after the pre-check.
const dispatcher = new Agent({
    connect: {
        lookup: pinnedLookup,
        autoSelectFamily: false,
    },
});

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const REQUEST_HEADERS = {
    // Some sites serve a stub to unknown agents; a browser-ish accept header
    // gets us the real document without pretending to be a specific browser.
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetches a page's HTML while keeping the server safe:
 * every redirect hop is re-validated against the SSRF guard, the whole request
 * is time-boxed, and the body is truncated at MAX_HTML_BYTES.
 */
export async function fetchPage(rawUrl) {
    const startedAt = Date.now();
    const { response, url } = await fetchPublic(rawUrl, {
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        await discardBody(response);
        throw new MetadataError(
            ERROR_CODES.HTTP_ERROR,
            describeHttpStatus(response.status, response.statusText),
            { status: response.status }
        );
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !isParsableContentType(contentType)) {
        await discardBody(response);
        throw new MetadataError(
            ERROR_CODES.UNSUPPORTED_CONTENT_TYPE,
            `This address returns ${describeContentType(contentType)}, not a web page we can read metadata from.`,
            { contentType }
        );
    }

    const html = await readCappedText(response, contentType);

    return {
        html,
        finalUrl: response.url || url.href,
        status: response.status,
        contentType,
        // Crawlers honour this header as strictly as <meta name="robots">.
        robotsHeader: response.headers.get('x-robots-tag') || '',
        elapsedMs: Date.now() - startedAt,
    };
}

/**
 * Follows redirects by hand so every hop is re-validated against the SSRF
 * guard, both before the request and again inside the connect-time lookup.
 * Resolves with the first non-redirect response, body unread.
 */
export async function fetchPublic(rawUrl, { headers, signal, method = 'GET' }) {
    let url = parseUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        await assertPublicUrl(url);

        let response;
        try {
            response = await undiciFetch(url, {
                method,
                headers,
                redirect: 'manual',
                signal,
                dispatcher,
            });
        } catch (error) {
            throw toMetadataError(error, url.href);
        }

        if (!REDIRECT_STATUSES.has(response.status)) return { response, url };

        const location = response.headers.get('location');
        await discardBody(response);

        if (!location) {
            throw new MetadataError(
                ERROR_CODES.HTTP_ERROR,
                `The site sent a redirect (${response.status}) without telling us where to go.`,
                { status: response.status }
            );
        }

        let next;
        try {
            next = new URL(location, url);
        } catch {
            throw new MetadataError(
                ERROR_CODES.HTTP_ERROR,
                'The site redirected us to an address we could not understand.',
                { status: response.status }
            );
        }

        // Re-run full validation so an open redirect cannot walk us into
        // the private network or off onto a non-HTTP scheme.
        url = parseUrl(next.href);
    }

    throw new MetadataError(
        ERROR_CODES.TOO_MANY_REDIRECTS,
        `This address redirected more than ${MAX_REDIRECTS} times, so we stopped following it.`
    );
}

function isParsableContentType(contentType) {
    const type = contentType.split(';')[0].trim().toLowerCase();
    return (
        type === 'text/html' ||
        type === 'application/xhtml+xml' ||
        type === 'text/plain' ||
        type === 'application/xml' ||
        type === 'text/xml'
    );
}

function describeContentType(contentType) {
    const type = contentType.split(';')[0].trim().toLowerCase();
    if (type.startsWith('image/')) return 'an image';
    if (type.startsWith('video/')) return 'a video file';
    if (type.startsWith('audio/')) return 'an audio file';
    if (type === 'application/pdf') return 'a PDF';
    if (type === 'application/json') return 'JSON data';
    if (type.startsWith('application/zip') || type.includes('octet-stream')) {
        return 'a binary download';
    }
    return `content of type "${type}"`;
}

/** Reads the body but refuses to buffer more than MAX_HTML_BYTES. */
async function readCappedText(response, contentType) {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_HTML_BYTES) {
        await discardBody(response);
        throw tooLargeError();
    }

    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_HTML_BYTES) {
                await reader.cancel().catch(() => {});
                throw tooLargeError();
            }
            chunks.push(value);
        }
    } catch (error) {
        if (error instanceof MetadataError) throw error;
        throw toMetadataError(error, response.url);
    }

    return decode(Buffer.concat(chunks), contentType);
}

function tooLargeError() {
    return new MetadataError(
        ERROR_CODES.RESPONSE_TOO_LARGE,
        `This page is larger than ${Math.round(MAX_HTML_BYTES / 1024)} KB, so we stopped downloading it.`
    );
}

/**
 * Decodes the body using the charset the server declared, falling back to the
 * document's own `<meta charset>` and finally to UTF-8.
 */
function decode(buffer, contentType) {
    const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
    const head = buffer.subarray(0, 2048).toString('latin1');
    const fromDocument =
        /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
        /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];

    for (const charset of [fromHeader, fromDocument, 'utf-8']) {
        if (!charset) continue;
        try {
            return new TextDecoder(charset, { fatal: false }).decode(buffer);
        } catch {
            // Unknown label. Fall through to the next candidate.
        }
    }
    return buffer.toString('utf8');
}

export async function discardBody(response) {
    try {
        await response.body?.cancel();
    } catch {
        // Nothing useful to do if the socket is already gone.
    }
}
