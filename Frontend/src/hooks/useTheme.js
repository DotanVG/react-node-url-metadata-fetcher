import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'umf:theme';

const readStoredTheme = () => {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // Private browsing or a blocked storage API: fall back to the OS.
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
};

export function useTheme() {
    const [theme, setTheme] = useState(readStoredTheme);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.style.colorScheme = theme;
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // Not being able to remember the choice is not worth an error.
        }
    }, [theme]);

    const toggleTheme = useCallback(
        () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
        []
    );

    return { theme, toggleTheme };
}
