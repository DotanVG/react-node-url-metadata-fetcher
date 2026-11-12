import { jest } from '@jest/globals';

import { combineSignal } from '../src/publicFetch.js';
import { ERROR_CODES, toMetadataError } from '../src/errors.js';

describe('combineSignal', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('aborts with TimeoutError when the budget elapses', () => {
        const signal = combineSignal(undefined, 5000);

        expect(signal.aborted).toBe(false);
        jest.advanceTimersByTime(4999);
        expect(signal.aborted).toBe(false);

        jest.advanceTimersByTime(1);
        expect(signal.aborted).toBe(true);
        expect(signal.reason?.name).toBe('TimeoutError');
        expect(toMetadataError(signal.reason, 'https://example.com/slow').code).toBe(
            ERROR_CODES.TIMEOUT
        );
        expect(jest.getTimerCount()).toBe(0);
    });

    it('clears the timeout timer when the caller aborts first', () => {
        const caller = new AbortController();
        const signal = combineSignal(caller.signal, 5000);

        expect(jest.getTimerCount()).toBe(1);
        caller.abort();

        expect(signal.aborted).toBe(true);
        expect(signal.reason?.name).toBe('AbortError');
        expect(jest.getTimerCount()).toBe(0);

        jest.advanceTimersByTime(5000);
        expect(signal.reason?.name).toBe('AbortError');
    });

    it('does not arm a timer when the caller is already aborted', () => {
        const caller = new AbortController();
        caller.abort();

        const signal = combineSignal(caller.signal, 5000);

        expect(signal.aborted).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
    });
});
