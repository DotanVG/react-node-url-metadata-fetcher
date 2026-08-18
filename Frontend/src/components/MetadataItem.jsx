import { useRef, useState } from 'react';
import { FiAlertCircle, FiExternalLink, FiMaximize2 } from 'react-icons/fi';

import MetadataAudit from './MetadataAudit.jsx';
import ModalDialog from './ModalDialog.jsx';
import ResultImage from './ResultImage.jsx';
import { hostnameOf, prettyUrl } from '../lib/urls.js';

const ERROR_HINTS = {
    BLOCKED_HOST: 'Private and internal addresses are refused on purpose.',
    HTTP_ERROR: 'Some sites deliberately block automated visitors.',
    UNSUPPORTED_CONTENT_TYPE: 'Only web pages carry metadata worth showing.',
    TIMEOUT: 'Try again. Slow sites sometimes answer on a second attempt.',
    DNS_ERROR: 'Check the spelling of the domain.',
};

const MetadataItem = ({ item, layout = 'list', imagePreviewEnabled = true }) => {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const detailsTriggerRef = useRef(null);

    if (!item.ok) {
        return (
            <li className="h-full rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
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

    const isGrid = layout === 'grid';
    const destination = item.finalUrl || item.url;

    return (
        <li className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
            {isGrid && (
                <div
                    onClick={() => setDetailsOpen(true)}
                    aria-hidden="true"
                    className="absolute inset-0 z-0 cursor-pointer rounded-xl"
                />
            )}

            <div
                className={`${isGrid ? 'pointer-events-none relative z-10 flex h-full flex-col' : 'flex flex-col md:flex-row'}`}
            >
                <div
                    className={`${isGrid ? 'pointer-events-auto w-full' : 'md:w-72 md:shrink-0 lg:w-80'}`}
                >
                    <ResultImage
                        image={item.image}
                        alt={item.imageAlt}
                        title={item.title || item.siteName}
                        layout={layout}
                        interactive={imagePreviewEnabled}
                    />
                </div>

                <div className={`min-w-0 flex-1 ${isGrid ? 'p-4' : 'p-4 sm:p-5'}`}>
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
                        {!isGrid && item.type && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                                {item.type}
                            </span>
                        )}
                        {!isGrid && typeof item.elapsedMs === 'number' && (
                            <span className="tabular-nums">{item.elapsedMs} ms</span>
                        )}
                    </div>

                    <h4
                        className={`mt-2 font-semibold leading-snug text-slate-900 dark:text-white ${
                            isGrid ? 'line-clamp-2 text-base' : 'text-lg'
                        }`}
                    >
                        {item.title || <span className="italic text-slate-400">No title found</span>}
                    </h4>

                    {!isGrid && (
                        <p className="mt-1.5 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
                            {item.description || (
                                <span className="italic text-slate-400">
                                    No description found
                                </span>
                            )}
                        </p>
                    )}

                    {!isGrid && (item.author || item.publishedAt) && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {item.author}
                            {item.author && item.publishedAt ? ' · ' : ''}
                            {formatDate(item.publishedAt)}
                        </p>
                    )}

                    <a
                        href={destination}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={`${isGrid ? 'pointer-events-auto relative z-20 mt-2 text-xs' : 'mt-3 text-sm'} inline-flex max-w-full items-center gap-1.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400`}
                    >
                        <span className="truncate">{prettyUrl(destination)}</span>
                        <FiExternalLink size={13} className="shrink-0" aria-hidden="true" />
                    </a>

                    {isGrid && (
                        <button
                            ref={detailsTriggerRef}
                            type="button"
                            onClick={() => setDetailsOpen(true)}
                            aria-label={`Open full details for ${item.title || item.siteName || destination}`}
                            aria-haspopup="dialog"
                            aria-expanded={detailsOpen}
                            className="pointer-events-auto relative z-20 mt-4 flex w-full items-center justify-between gap-3 border-t border-slate-200 pt-3 text-left text-xs transition hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:hover:text-indigo-300"
                        >
                            <span className="text-slate-500 dark:text-slate-400">
                                Metadata completeness
                            </span>
                            <span className="ml-auto font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                                {Number.isFinite(item.audit?.score)
                                    ? `${item.audit.score}%`
                                    : 'Not scored'}
                            </span>
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                <FiMaximize2 size={13} aria-hidden="true" />
                                View details
                            </span>
                        </button>
                    )}

                    {!isGrid && <MetadataAudit audit={item.audit} result={item} />}
                </div>
            </div>

            {isGrid && (
                <ModalDialog
                    open={detailsOpen}
                    onClose={() => setDetailsOpen(false)}
                    label={`Full details for ${item.title || item.siteName || destination}`}
                    closeLabel="Close full details"
                    triggerRef={detailsTriggerRef}
                    testId="full-details-dialog"
                    panelClassName="w-full max-w-5xl overflow-hidden"
                >
                    <div className="max-h-[90vh] overflow-y-auto p-3 pt-14 sm:p-6 sm:pt-14">
                        <ul>
                            <MetadataItem
                                item={item}
                                layout="list"
                                imagePreviewEnabled={false}
                            />
                        </ul>
                    </div>
                </ModalDialog>
            )}
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
