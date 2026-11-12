import { MAX_REDIRECTS } from './config.js';
import { ERROR_CODES, MetadataError, toMetadataError } from './errors.js';
import { assertPublicUrl, parseUrl } from './urlSafety.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function combineSignal(signal, timeoutMs) {
    const controller = new AbortController();
    let timer = null;

    const abortFromTimeout = () => {
        timer = null;
        if (controller.signal.aborted) return;
        controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    };

    const arm = () => {
        timer = setTimeout(abortFromTimeout, timeoutMs);
        // The open socket keeps the process alive while a fetch is in flight.
        // An abandoned timer should not.
        timer.unref?.();
    };

    const disarm = () => {
        if (timer === null) return;
        clearTimeout(timer);
        timer = null;
    };

    if (!signal) {
        arm();
        return controller.signal;
    }

    const onCallerAbort = () => {
        disarm();
        if (!controller.signal.aborted) controller.abort(signal.reason);
    };

    if (signal.aborted) {
        onCallerAbort();
        return controller.signal;
    }

    arm();
    signal.addEventListener('abort', onCallerAbort, { once: true });
    controller.signal.addEventListener(
        'abort',
        () => {
            disarm();
            signal.removeEventListener('abort', onCallerAbort);
        },
        { once: true }
    );

    return controller.signal;
}

/**
 * Follows redirects by hand so every hop is re-validated against the SSRF
 * guard. Resolves with the first non-redirect response, body unread.
 */
export async function fetchPublic(rawUrl, { headers, signal, method = 'GET' }) {
    let url = parseUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        await assertPublicUrl(url);

        let response;
        try {
            response = await fetch(url, { method, headers, redirect: 'manual', signal });
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

export async function discardBody(response) {
    try {
        await response.body?.cancel();
    } catch {
        // Nothing useful to do if the socket is already gone.
    }
}
