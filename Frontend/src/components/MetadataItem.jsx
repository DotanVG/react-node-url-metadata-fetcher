import { useState } from 'react';
import { FiAlertCircle, FiExternalLink, FiImage } from 'react-icons/fi';

import MetadataAudit from './MetadataAudit.jsx';
import { hostnameOf, prettyUrl } from '../lib/urls.js';

const ERROR_HINTS = {
    BLOCKED_HOST: 'Private and internal addresses are refused on purpose.',
    HTTP_ERROR: 'Some sites deliberately block automated visitors.',
    UNSUPPORTED_CONTENT_TYPE: 'Only web pages carry metadata worth showing.',
    TIMEOUT: 'Try again — slow sites sometimes answer on a second attempt.',
    DNS_ERROR: 'Check the spelling of the domain.',
};

const MetadataItem = ({ item }) => {
    const [imageFailed, setImageFailed] = useState(false);

    if (!item.ok) {
        return (
            <li className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                <div className="flex items-start gap-3">
                    <FiAlertCircle
                        className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
                        size={18}
                        aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                        <p className="break-all font-semibold text-rose-900 dark:text-rose-200">
                            {prettyUrl(item.url) || item.url}
                        </p>
                        <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
                            {item.error?.message ?? 'This URL could not be fetched.'}
                        </p>
                        {ERROR_HINTS[item.error?.code] && (
                            <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/70">
                                {ERROR_HINTS[item.error.code]}
                            </p>
                        )}
                        <span className="mt-2 inline-block rounded bg-rose-100 px-2 py-0.5 font-mono text-xs text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                            {item.error?.code ?? 'ERROR'}
                        </span>
                    </div>
                </div>
            </li>
        );
    }

    const showImage = item.image && !imageFailed;

    return (
        <li className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
            <div className="flex flex-col sm:flex-row">
                <div className="sm:w-56 sm:shrink-0">
                    {showImage ? (
                        <img
                            src={item.image}
                            alt={item.imageAlt || item.title || 'Preview image'}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => setImageFailed(true)}
                            className="h-40 w-full bg-slate-100 object-cover sm:h-full sm:min-h-[9rem] dark:bg-slate-800"
                        />
                    ) : (
                        <div className="flex h-40 w-full items-center justify-center bg-slate-100 sm:h-full sm:min-h-[9rem] dark:bg-slate-800">
                            <FiImage
                                className="text-slate-400 dark:text-slate-600"
                                size={28}
                                aria-label="No preview image"
                            />
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {item.favicon && (
                            <img
                                src={item.favicon}
                                alt=""
                                width="16"
                                height="16"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-4 w-4 rounded-sm"
                                onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                }}
                            />
                        )}
                        <span className="font-medium">
                            {item.siteName || hostnameOf(item.finalUrl || item.url)}
                        </span>
                        {item.type && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                                {item.type}
                            </span>
                        )}
                        {typeof item.elapsedMs === 'number' && (
                            <span className="tabular-nums">{item.elapsedMs} ms</span>
                        )}
                    </div>

                    <h4 className="mt-2 text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                        {item.title || <span className="italic text-slate-400">No title found</span>}
                    </h4>

                    <p className="mt-1.5 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
                        {item.description || (
                            <span className="italic text-slate-400">No description found</span>
                        )}
                    </p>

                    {(item.author || item.publishedAt) && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {item.author}
                            {item.author && item.publishedAt ? ' · ' : ''}
                            {formatDate(item.publishedAt)}
                        </p>
                    )}

                    <a
                        href={item.finalUrl || item.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                        <span className="truncate">{prettyUrl(item.finalUrl || item.url)}</span>
                        <FiExternalLink size={13} className="shrink-0" aria-hidden="true" />
                    </a>

                    <MetadataAudit audit={item.audit} result={item} />
                </div>
            </div>
        </li>
    );
};

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export default MetadataItem;
