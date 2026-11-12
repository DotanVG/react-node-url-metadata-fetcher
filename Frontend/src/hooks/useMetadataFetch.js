import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { toast } from 'react-toastify';

import { fetchMetadata, isRequestCancelled } from '../lib/api.js';

/** Strips any markup the remote page smuggled into its own metadata. */
const sanitizeText = (value) =>
    typeof value === 'string'
        ? DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
        : value;

const sanitizeResult = (result) => ({
    ...result,
    title: sanitizeText(result.title),
    description: sanitizeText(result.description),
    siteName: sanitizeText(result.siteName),
    author: sanitizeText(result.author),
    imageAlt: sanitizeText(result.imageAlt),
});

export function useMetadataFetch(backend) {
    const [results, setResults] = useState([]);
    const [summary, setSummary] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const requestSeq = useRef(0);
    const fetchAbortRef = useRef(null);

    useEffect(() => {
        return () => {
            requestSeq.current += 1;
            fetchAbortRef.current?.abort();
        };
    }, []);

    const clearResults = useCallback(() => {
        requestSeq.current += 1;
        fetchAbortRef.current?.abort();
        fetchAbortRef.current = null;
        setResults([]);
        setSummary(null);
        setIsLoading(false);
    }, []);

    const runFetch = useCallback(
        async (targetUrls) => {
            const requestId = ++requestSeq.current;
            fetchAbortRef.current?.abort();
            const controller = new AbortController();
            fetchAbortRef.current = controller;

            setIsLoading(true);
            setResults([]);
            setSummary(null);

            try {
                const payload = await fetchMetadata(targetUrls, { signal: controller.signal });
                if (requestId !== requestSeq.current) return;

                backend.reportReachable();

                setResults(payload.results.map(sanitizeResult));
                setSummary(payload.summary ?? null);

                const { succeeded = 0, failed = 0 } = payload.summary ?? {};
                if (failed > 0 && succeeded === 0) {
                    toast.error('None of those URLs could be fetched. See the details below.');
                } else if (failed > 0) {
                    toast.warning(`${succeeded} fetched, ${failed} failed. See the details below.`);
                }
            } catch (error) {
                if (requestId !== requestSeq.current || isRequestCancelled(error)) return;
                if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
                    backend.reportUnreachable();
                }
                toast.error(error.message);
            } finally {
                if (requestId === requestSeq.current) {
                    setIsLoading(false);
                }
            }
        },
        [backend]
    );

    return { results, summary, isLoading, runFetch, clearResults };
}
