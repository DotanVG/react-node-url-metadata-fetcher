import { FiAlertTriangle, FiCoffee, FiRefreshCw } from 'react-icons/fi';

import { API_BASE_URL } from '../lib/api.js';
import { BACKEND_STATUS } from '../hooks/useBackendStatus.js';

/**
 * Explains the free-tier cold start rather than leaving the user to wonder why
 * nothing is happening. Only appears once the first ping has actually failed.
 */
const ColdStartNotice = ({ status, elapsedSeconds, onRetry }) => {
    if (status === BACKEND_STATUS.WAKING) {
        return (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <FiCoffee className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                <div>
                    <p className="font-semibold">
                        Waking up the API — this takes up to a minute.
                    </p>
                    <p className="mt-1">
                        The backend runs on a free tier that sleeps after 15 minutes
                        of inactivity. It has been {elapsedSeconds} second
                        {elapsedSeconds === 1 ? '' : 's'} so far. You can add your
                        URLs meanwhile; the request will go through as soon as the
                        server is up.
                    </p>
                </div>
            </div>
        );
    }

    if (status === BACKEND_STATUS.OFFLINE) {
        return (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                <FiAlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                <div className="min-w-0">
                    <p className="font-semibold">The API did not respond.</p>
                    <p className="mt-1 break-words">
                        We could not reach{' '}
                        <code className="rounded bg-rose-100 px-1 py-0.5 font-mono text-xs dark:bg-rose-500/20">
                            {API_BASE_URL}
                        </code>
                        . It may still be booting, or it may be down. Running
                        locally? Start the backend with{' '}
                        <code className="rounded bg-rose-100 px-1 py-0.5 font-mono text-xs dark:bg-rose-500/20">
                            npm start
                        </code>{' '}
                        in the Backend folder.
                    </p>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                    >
                        <FiRefreshCw size={14} aria-hidden="true" /> Try again
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default ColdStartNotice;
