import { useEffect, useState } from 'react';

const STORAGE_KEY = 'umf:urls';
const MAX_PERSISTED = 20;

const read = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
        return Array.isArray(stored)
            ? stored.filter((url) => typeof url === 'string').slice(0, MAX_PERSISTED)
            : [];
    } catch {
        return [];
    }
};

/** Keeps the URL list across reloads, so a stray refresh is not destructive. */
export function usePersistentUrls() {
    const [urls, setUrls] = useState(read);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(urls.slice(0, MAX_PERSISTED))
            );
        } catch {
            // Storage is a nicety here, never a requirement.
        }
    }, [urls]);

    return [urls, setUrls];
}
