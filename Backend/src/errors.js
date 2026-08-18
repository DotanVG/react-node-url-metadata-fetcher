/**
 * Every failure the API can report about a single URL, with a message written
 * for the person staring at the UI rather than for a log file.
 */
export const ERROR_CODES = {
    INVALID_URL: 'INVALID_URL',
    UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
    BLOCKED_HOST: 'BLOCKED_HOST',
    DNS_ERROR: 'DNS_ERROR',
    CONNECTION_REFUSED: 'CONNECTION_REFUSED',
    TIMEOUT: 'TIMEOUT',
    TOO_MANY_REDIRECTS: 'TOO_MANY_REDIRECTS',
    HTTP_ERROR: 'HTTP_ERROR',
    UNSUPPORTED_CONTENT_TYPE: 'UNSUPPORTED_CONTENT_TYPE',
    RESPONSE_TOO_LARGE: 'RESPONSE_TOO_LARGE',
    NETWORK_ERROR: 'NETWORK_ERROR',
    UNKNOWN: 'UNKNOWN',
};

export class MetadataError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'MetadataError';
        this.code = code;
        this.details = details;
    }

    toJSON() {
        return { code: this.code, message: this.message, ...this.details };
    }
}

/**
 * Turns a thrown value from `fetch` (or our own guards) into a MetadataError
 * whose message a user can act on.
 */
export function toMetadataError(error, url) {
    if (error instanceof MetadataError) return error;

    const cause = error?.cause ?? {};
    const systemCode = cause.code || error?.code;

    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return new MetadataError(
            ERROR_CODES.TIMEOUT,
            'The site took too long to respond and the request timed out.'
        );
    }

    switch (systemCode) {
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
            return new MetadataError(
                ERROR_CODES.DNS_ERROR,
                `We could not resolve the domain "${safeHostname(url)}". Check the spelling of the address.`
            );
        case 'ECONNREFUSED':
            return new MetadataError(
                ERROR_CODES.CONNECTION_REFUSED,
                'The server refused the connection. It may be offline or blocking automated requests.'
            );
        case 'ECONNRESET':
        case 'EPIPE':
            return new MetadataError(
                ERROR_CODES.NETWORK_ERROR,
                'The connection was closed before the page finished loading.'
            );
        case 'ETIMEDOUT':
            return new MetadataError(
                ERROR_CODES.TIMEOUT,
                'The site took too long to respond and the request timed out.'
            );
        case 'CERT_HAS_EXPIRED':
        case 'DEPTH_ZERO_SELF_SIGNED_CERT':
        case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        case 'ERR_TLS_CERT_ALTNAME_INVALID':
            return new MetadataError(
                ERROR_CODES.NETWORK_ERROR,
                'The site presented an invalid HTTPS certificate, so we stopped before loading it.'
            );
        default:
            return new MetadataError(
                ERROR_CODES.NETWORK_ERROR,
                'We could not reach this page. It may be down, private, or blocking automated requests.'
            );
    }
}

function safeHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/**
 * Human-readable explanation for an unhappy HTTP status.
 */
export function describeHttpStatus(status, statusText) {
    const explanations = {
        401: 'The page requires a login, so its metadata is not public.',
        403: 'The site blocked our request (403 Forbidden). Many sites reject automated visitors.',
        404: 'The page was not found (404). Double-check the address.',
        410: 'The page has been permanently removed (410 Gone).',
        429: 'The site is rate limiting us (429). Try again in a little while.',
        451: 'The page is unavailable for legal reasons (451).',
        500: 'The site returned a server error (500). That is a problem on their end.',
        502: 'The site returned a bad gateway error (502). That is a problem on their end.',
        503: 'The site is temporarily unavailable (503). Try again in a little while.',
        504: 'The site timed out behind its own gateway (504).',
    };

    if (explanations[status]) return explanations[status];
    if (status >= 500) {
        return `The site returned a server error (${status}${statusText ? ` ${statusText}` : ''}).`;
    }
    return `The site responded with HTTP ${status}${statusText ? ` ${statusText}` : ''}.`;
}
