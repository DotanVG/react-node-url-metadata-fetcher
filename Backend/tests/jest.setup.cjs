// Jest's VM has its own Symbol.dispose, so Node's AbortListener disposable
// (keyed by the host symbol) looks like it has no dispose method. undici 8
// then calls undefined at the end of every fetch. Re-wrap the disposable
// with this realm's Symbol.dispose before any test imports undici.
const events = require('node:events');

if (typeof events.addAbortListener === 'function') {
    const original = events.addAbortListener;
    events.addAbortListener = function addAbortListener(signal, listener) {
        const disposable = original(signal, listener);
        if (typeof disposable?.[Symbol.dispose] === 'function') return disposable;

        const dispose = Object.getOwnPropertySymbols(disposable || {})
            .map((key) => disposable[key])
            .find((value) => typeof value === 'function');

        if (typeof dispose !== 'function') return disposable;

        return {
            [Symbol.dispose]() {
                dispose.call(disposable);
            },
        };
    };
}
