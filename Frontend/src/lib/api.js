export const API_BASE_URL = (
    import.meta.env?.VITE_API_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

export class ApiError extends Error {
    constructor(message, { code = 'UNKNOWN', status = 0, retryAfterSeconds } = {}) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/**
 * Liveness probe. Doubles as the wake-up call for the free-tier host, which
 * suspends the instance after 15 minutes of inactivity and then needs the best
 * part of a minute to boot again.
 */
export async function pingHealth({ timeoutMs = 5000, signal } = {}) {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {
        method: 'GET',
        timeoutMs,
        signal,
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new ApiError(`Health check failed with HTTP ${response.status}.`, {
            code: 'HEALTH_CHECK_FAILED',
            status: response.status,
        });
    }

    return response.json().catch(() => ({ status: 'ok' }));
}

export async function fetchMetadata(urls, { signal, timeoutMs = 90_000 } = {}) {
    let response;
    try {
        response = await fetchWithTimeout(`${API_BASE_URL}/fetch-metadata`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ urls }),
            timeoutMs,
            signal,
        });
    } catch (error) {
        throw asApiError(error);
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const details = payload?.error ?? {};
        throw new ApiError(details.message || describeStatus(response.status), {
            code: details.code || 'REQUEST_FAILED',
            status: response.status,
            retryAfterSeconds: details.retryAfterSeconds,
        });
    }

    if (!payload || !Array.isArray(payload.results)) {
        throw new ApiError(
            'The server sent a response we could not understand. Please try again.',
            { code: 'MALFORMED_RESPONSE', status: response.status }
        );
    }

    return payload;
}

async function fetchWithTimeout(url, { timeoutMs, signal, ...options }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

function asApiError(error) {
    if (error instanceof ApiError) return error;

    if (error?.name === 'AbortError') {
        return new ApiError(
            'The request took too long and was cancelled. The API may still be starting up. Try again in a moment.',
            { code: 'TIMEOUT' }
        );
    }

    return new ApiError(
        `Could not reach the API at ${API_BASE_URL}. Check your connection, or wait for the server to finish waking up.`,
        { code: 'NETWORK_ERROR' }
    );
}

function describeStatus(status) {
    if (status === 403) {
        return 'The API refused this request. If you are running a local copy, add your address to ALLOWED_ORIGINS.';
    }
    if (status >= 500) {
        return 'The API hit an internal error. Please try again in a moment.';
    }
    return `The API responded with HTTP ${status}.`;
}
