import { FiAlertTriangle, FiCheckCircle, FiLoader, FiRefreshCw } from 'react-icons/fi';

import { BACKEND_STATUS } from '../hooks/useBackendStatus.js';

const PRESETS = {
    [BACKEND_STATUS.CHECKING]: {
        icon: FiLoader,
        spin: true,
        label: 'Connecting to API…',
        classes:
            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        dot: 'bg-slate-400',
    },
    [BACKEND_STATUS.WAKING]: {
        icon: FiLoader,
        spin: true,
        label: 'Waking the API…',
        classes:
            'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
        dot: 'bg-amber-500',
    },
    [BACKEND_STATUS.ONLINE]: {
        icon: FiCheckCircle,
        spin: false,
        label: 'API ready',
        classes:
            'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    [BACKEND_STATUS.OFFLINE]: {
        icon: FiAlertTriangle,
        spin: false,
        label: 'API unreachable',
        classes: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
        dot: 'bg-rose-500',
    },
};

const BackendStatus = ({ status, elapsedSeconds, onRetry }) => {
    const preset = PRESETS[status] ?? PRESETS[BACKEND_STATUS.CHECKING];
    const Icon = preset.icon;
    const showElapsed = status === BACKEND_STATUS.WAKING && elapsedSeconds > 0;

    return (
        <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${preset.classes}`}
            role="status"
            aria-live="polite"
        >
            <span className={`h-2 w-2 shrink-0 rounded-full ${preset.dot}`} aria-hidden="true" />
            <Icon
                className={preset.spin ? 'animate-spin' : ''}
                size={15}
                aria-hidden="true"
            />
            <span>
                {preset.label}
                {showElapsed ? ` ${elapsedSeconds}s` : ''}
            </span>
            {status === BACKEND_STATUS.OFFLINE && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                    <FiRefreshCw size={12} aria-hidden="true" /> Retry
                </button>
            )}
        </div>
    );
};

export default BackendStatus;
