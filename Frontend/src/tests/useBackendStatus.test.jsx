import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { BACKEND_STATUS, useBackendStatus } from '../hooks/useBackendStatus.js';

describe('useBackendStatus', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const okResponse = () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
    });

    it('pings the backend immediately on mount, without waiting for the user', async () => {
        fetch.mockResolvedValue(okResponse());

        const { result } = renderHook(() => useBackendStatus());

        expect(fetch).toHaveBeenCalled();
        expect(fetch.mock.calls[0][0]).toMatch(/\/health$/);

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.ONLINE));
        expect(result.current.isReady).toBe(true);
    });

    it('reports "waking" once the first ping fails, then recovers', async () => {
        fetch
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValue(okResponse());

        const { result } = renderHook(() => useBackendStatus());

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.WAKING));
        await waitFor(
            () => expect(result.current.status).toBe(BACKEND_STATUS.ONLINE),
            { timeout: 5000 }
        );
        expect(fetch.mock.calls.length).toBeGreaterThan(1);
    }, 10_000);

    it('treats a non-2xx health response as not ready', async () => {
        fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

        const { result } = renderHook(() => useBackendStatus());

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.WAKING));
    });

    it('retry() starts a fresh wake-up attempt', async () => {
        fetch.mockRejectedValue(new TypeError('Failed to fetch'));
        const { result } = renderHook(() => useBackendStatus());

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.WAKING));

        fetch.mockResolvedValue(okResponse());
        act(() => result.current.retry());

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.ONLINE));
    });

    it('reportReachable and reportUnreachable let real requests correct the status', async () => {
        fetch.mockResolvedValue(okResponse());
        const { result } = renderHook(() => useBackendStatus());

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.ONLINE));

        act(() => result.current.reportUnreachable());
        expect(result.current.status).toBe(BACKEND_STATUS.OFFLINE);

        act(() => result.current.reportReachable());
        expect(result.current.status).toBe(BACKEND_STATUS.ONLINE);
    });

    it('stops polling once unmounted', async () => {
        fetch.mockRejectedValue(new TypeError('Failed to fetch'));
        const { result, unmount } = renderHook(() => useBackendStatus());

        await waitFor(() => expect(result.current.status).toBe(BACKEND_STATUS.WAKING));
        const callsAtUnmount = fetch.mock.calls.length;
        unmount();

        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(fetch.mock.calls.length).toBe(callsAtUnmount);
    });
});
