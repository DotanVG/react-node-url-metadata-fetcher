import { FiTrash2, FiX } from 'react-icons/fi';

import { prettyUrl } from '../lib/urls.js';

const TaggedUrls = ({ urls, onRemove, onClearAll }) => {
    if (urls.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {urls.length} URL{urls.length === 1 ? '' : 's'} queued
                </p>
                <button
                    type="button"
                    onClick={onClearAll}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-500 transition hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-400 dark:hover:text-rose-400"
                >
                    <FiTrash2 size={14} aria-hidden="true" /> Clear all
                </button>
            </div>

            <ul className="flex flex-wrap gap-2">
                {urls.map((url) => (
                    <li
                        key={url}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-100 py-1.5 pl-3 pr-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                        <span className="truncate" title={url}>
                            {prettyUrl(url)}
                        </span>
                        <button
                            type="button"
                            onClick={() => onRemove(url)}
                            aria-label={`Remove ${url}`}
                            className="rounded-full p-1 text-slate-500 transition hover:bg-slate-200 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:hover:bg-slate-700 dark:hover:text-rose-400"
                        >
                            <FiX size={14} />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TaggedUrls;
