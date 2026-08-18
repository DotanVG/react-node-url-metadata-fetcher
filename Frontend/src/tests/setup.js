import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// jsdom implements neither of these, and several components rely on them.
if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}

// Node 25 exposes an incomplete localStorage object unless a storage file is
// configured. Replace it in tests so the browser contract stays consistent.
if (typeof window.localStorage?.clear !== 'function') {
    const storage = new Map();
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            get length() {
                return storage.size;
            },
            clear: () => storage.clear(),
            getItem: (key) => storage.get(String(key)) ?? null,
            key: (index) => [...storage.keys()][index] ?? null,
            removeItem: (key) => storage.delete(String(key)),
            setItem: (key, value) => storage.set(String(key), String(value)),
        },
    });
}

if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
}
