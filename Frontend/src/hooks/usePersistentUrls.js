import { useEffect, useState } from 'react';

import { MAX_URLS } from '../lib/urls.js';

const STORAGE_KEY = 'umf:urls';

const read = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
        return Array.isArray(stored)
            ? stored.filter((url) => typeof url === 'string').slice(0, MAX_URLS)
            : [];
    } catch {
        return [];
    }
};

export function usePersistentUrls() {
    const [urls, setUrls] = useState(read);

    useEffect(() => {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(urls.slice(0, MAX_URLS))
            );
        } catch {
            // Storage is a nicety here, never a requirement.
        }
    }, [urls]);

    return [urls, setUrls];
}
