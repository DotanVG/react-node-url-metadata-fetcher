import { useCallback, useEffect, useRef, useState } from 'react';

import { pingHealth } from '../lib/api.js';

// The API is hosted on a free tier that suspends the instance after a spell of
// inactivity. A cold boot usually lands between 30 and 60 seconds, so we keep
// knocking for two minutes before calling it offline.
const FIRST_PING_TIMEOUT_MS = 6000;
const RETRY_TIMEOUT_MS = 12_000;
const WAKE_DEADLINE_MS = 120_000;
const BACKOFF_MS = [1500, 2500, 4000, 5000, 6000, 8000];

export const BACKEND_STATUS = {
    CHECKING: 'checking',
    WAKING: 'waking',
    ONLINE: 'online',
    OFFLINE: 'offline',
};

/**
 * Wakes the API as soon as the page loads and reports where that stands, so
 * the first thing a visitor does is never the thing that has to wait 50
 * seconds for a cold start.
 */
export function useBackendStatus() {
    const [status, setStatus] = useState(BACKEND_STATUS.CHECKING);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [attempts, setAttempts] = useState(0);

    const timeoutRef = useRef(null);
    const abortRef = useRef(null);
    const startedAtRef = useRef(0);
    const cancelledRef = useRef(false);

    const clearPendingRetry = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const wake = useCallback(
        function wakeBackend() {
            clearPendingRetry();
            abortRef.current?.abort();

            const controller = new AbortController();
            abortRef.current = controller;
            cancelledRef.current = false;
            startedAtRef.current = Date.now();

            setStatus(BACKEND_STATUS.CHECKING);
            setElapsedSeconds(0);
            setAttempts(0);

            const attempt = async (attemptNumber) => {
                if (cancelledRef.current) return;

                setAttempts(attemptNumber + 1);

                try {
                    await pingHealth({
                        timeoutMs:
                            attemptNumber === 0
                                ? FIRST_PING_TIMEOUT_MS
                                : RETRY_TIMEOUT_MS,
                        signal: controller.signal,
                    });
                    if (cancelledRef.current) return;
                    setStatus(BACKEND_STATUS.ONLINE);
                } catch {
                    if (cancelledRef.current) return;

                    const waitedMs = Date.now() - startedAtRef.current;
                    if (waitedMs >= WAKE_DEADLINE_MS) {
                        setStatus(BACKEND_STATUS.OFFLINE);
                        return;
                    }

                    // The first failure is what tells us this is a cold start.
                    setStatus(BACKEND_STATUS.WAKING);
                    const delay =
                        BACKOFF_MS[Math.min(attemptNumber, BACKOFF_MS.length - 1)];
                    timeoutRef.current = setTimeout(
                        () => attempt(attemptNumber + 1),
                        delay
                    );
                }
            };

            attempt(0);
        },
        [clearPendingRetry]
    );

    // Kick off the wake-up immediately on mount — before the user has typed
    // anything, so the server warms up while they work.
    useEffect(() => {
        wake();

        return () => {
            cancelledRef.current = true;
            clearPendingRetry();
            abortRef.current?.abort();
        };
    }, [wake, clearPendingRetry]);

    // Drive the "waking up… 12s" counter.
    useEffect(() => {
        if (status !== BACKEND_STATUS.CHECKING && status !== BACKEND_STATUS.WAKING) {
            return undefined;
        }

        const interval = setInterval(() => {
            setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [status]);

    // A successful or failed real request is better evidence than a ping.
    const reportReachable = useCallback(() => {
        cancelledRef.current = true;
        clearPendingRetry();
        setStatus(BACKEND_STATUS.ONLINE);
    }, [clearPendingRetry]);

    const reportUnreachable = useCallback(() => {
        setStatus((current) =>
            current === BACKEND_STATUS.ONLINE ? BACKEND_STATUS.OFFLINE : current
        );
    }, []);

    return {
        status,
        elapsedSeconds,
        attempts,
        isReady: status === BACKEND_STATUS.ONLINE,
        retry: wake,
        reportReachable,
        reportUnreachable,
    };
}
