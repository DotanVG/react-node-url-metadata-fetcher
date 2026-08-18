import { useCallback, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { ToastContainer, toast } from 'react-toastify';
import { FiLink } from 'react-icons/fi';
import 'react-toastify/dist/ReactToastify.css';

import ColdStartNotice from './components/ColdStartNotice.jsx';
import Footer from './components/Footer.jsx';
import Navbar from './components/Navbar.jsx';
import ResultsSection from './components/ResultsSection.jsx';
import ResultsSkeleton from './components/ResultsSkeleton.jsx';
import SubmitButton from './components/SubmitButton.jsx';
import TaggedUrls from './components/TaggedUrls.jsx';
import UrlInput from './components/UrlInput.jsx';
import { useBackendStatus } from './hooks/useBackendStatus.js';
import { usePersistentUrls } from './hooks/usePersistentUrls.js';
import { useTheme } from './hooks/useTheme.js';
import { fetchMetadata } from './lib/api.js';
import { downloadFile, timestampedName, toCsv, toJson } from './lib/exports.js';
import { parseUrlList } from './lib/urls.js';

const MAX_URLS = 20;

const SAMPLE_URLS = [
    'https://github.com/DotanVG/react-node-url-metadata-fetcher',
    'https://developer.mozilla.org/en-US/docs/Web/HTML',
    'https://react.dev',
];

/** Strips any markup the remote page smuggled into its own metadata. */
const sanitizeText = (value) =>
    typeof value === 'string'
        ? DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
        : value;

const sanitizeResult = (result) => ({
    ...result,
    title: sanitizeText(result.title),
    description: sanitizeText(result.description),
    siteName: sanitizeText(result.siteName),
    author: sanitizeText(result.author),
    imageAlt: sanitizeText(result.imageAlt),
});

function App() {
    const { theme, toggleTheme } = useTheme();
    const backend = useBackendStatus();

    const [inputValue, setInputValue] = useState('');
    const [urls, setUrls] = usePersistentUrls();
    const [results, setResults] = useState([]);
    const [summary, setSummary] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyResetRef = useRef(null);

    /** Adds one or many URLs. Returns the list as it now stands. */
    const addUrls = useCallback(
        (rawValue) => {
            const { valid, invalid } = parseUrlList(rawValue);

            const duplicates = valid.filter((url) => urls.includes(url));
            const additions = valid.filter((url) => !urls.includes(url));
            const room = Math.max(0, MAX_URLS - urls.length);
            const accepted = additions.slice(0, room);
            const nextUrls = accepted.length > 0 ? [...urls, ...accepted] : urls;

            if (accepted.length > 0) {
                setUrls(nextUrls);
                // A single addition speaks for itself — the chip appears right
                // there. Only a bulk paste is worth interrupting for.
                if (accepted.length > 1) {
                    toast.success(`Added ${accepted.length} URLs`);
                }
            }
            if (duplicates.length > 0) {
                toast.info(
                    duplicates.length === 1
                        ? 'That URL is already in the list.'
                        : `${duplicates.length} URLs were already in the list.`
                );
            }
            if (additions.length > accepted.length) {
                toast.warning(`You can fetch up to ${MAX_URLS} URLs at a time.`);
            }
            if (invalid.length > 0) {
                toast.error(
                    invalid.length === 1
                        ? `"${invalid[0]}" is not a valid web address.`
                        : `Skipped ${invalid.length} entries that were not valid addresses.`
                );
            }

            setInputValue('');
            return nextUrls;
        },
        [urls, setUrls]
    );

    const removeUrl = useCallback(
        (target) => setUrls((current) => current.filter((url) => url !== target)),
        [setUrls]
    );

    const clearAll = useCallback(() => {
        setUrls([]);
        setResults([]);
        setSummary(null);
    }, [setUrls]);

    const loadSamples = useCallback(() => {
        setUrls(SAMPLE_URLS);
        toast.info('Loaded a few sample URLs.');
    }, [setUrls]);

    const runFetch = useCallback(
        async (targetUrls) => {
            setIsLoading(true);
            setResults([]);
            setSummary(null);

            try {
                const payload = await fetchMetadata(targetUrls);
                backend.reportReachable();

                setResults(payload.results.map(sanitizeResult));
                setSummary(payload.summary ?? null);

                // A clean run needs no toast — the results appear right below.
                // Only partial or total failure is worth interrupting for.
                const { succeeded = 0, failed = 0 } = payload.summary ?? {};
                if (failed > 0 && succeeded === 0) {
                    toast.error('None of those URLs could be fetched. See the details below.');
                } else if (failed > 0) {
                    toast.warning(`${succeeded} fetched, ${failed} failed. See the details below.`);
                }
            } catch (error) {
                if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
                    backend.reportUnreachable();
                }
                toast.error(error.message);
            } finally {
                setIsLoading(false);
            }
        },
        [backend]
    );

    const handleSubmit = useCallback(
        (event) => {
            event?.preventDefault();
            if (isLoading) return;

            // Fetch whatever is in the box too, so a half-finished entry is not
            // silently dropped on submit.
            const pending = inputValue.trim();
            const targetUrls = pending ? addUrls(pending) : urls;

            if (targetUrls.length === 0) {
                toast.error('Add at least one URL before fetching.');
                return;
            }

            runFetch(targetUrls);
        },
        [addUrls, inputValue, isLoading, runFetch, urls]
    );

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();

            if (event.metaKey || event.ctrlKey) {
                handleSubmit(event);
                return;
            }

            if (inputValue.trim()) {
                addUrls(inputValue);
            } else if (urls.length > 0) {
                handleSubmit(event);
            }
        },
        [addUrls, handleSubmit, inputValue, urls.length]
    );

    const handlePaste = useCallback(
        (event) => {
            const pasted = event.clipboardData?.getData('text') ?? '';
            // Only intercept multi-URL pastes; a single URL should stay editable.
            if (!/[\s,;]/.test(pasted.trim())) return;

            event.preventDefault();
            addUrls(pasted);
        },
        [addUrls]
    );

    const copyJson = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(toJson(results));
            setCopied(true);
            toast.success('Results copied as JSON.');
            clearTimeout(copyResetRef.current);
            copyResetRef.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Your browser blocked clipboard access. Use the JSON download instead.');
        }
    }, [results]);

    const downloadJson = useCallback(() => {
        downloadFile(timestampedName('json'), toJson(results), 'application/json');
    }, [results]);

    const downloadCsv = useCallback(() => {
        downloadFile(timestampedName('csv'), toCsv(results), 'text/csv');
    }, [results]);

    const canSubmit = useMemo(
        () => urls.length > 0 || inputValue.trim().length > 0,
        [inputValue, urls.length]
    );

    return (
        <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <Navbar theme={theme} onToggleTheme={toggleTheme} backend={backend} />

            <main className="mx-auto w-full max-w-5xl flex-grow px-4 py-8">
                <ColdStartNotice
                    status={backend.status}
                    elapsedSeconds={backend.elapsedSeconds}
                    onRetry={backend.retry}
                />

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        Extract metadata from any URL
                    </h2>
                    <p
                        id="url-input-hint"
                        className="mt-2 text-slate-600 dark:text-slate-400"
                    >
                        Add one URL or up to {MAX_URLS}. Press{' '}
                        <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800">
                            Enter
                        </kbd>{' '}
                        to add, or paste a whole list at once.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                        <div onPaste={handlePaste}>
                            <UrlInput
                                value={inputValue}
                                onChange={setInputValue}
                                onAdd={() => addUrls(inputValue)}
                                onClear={() => setInputValue('')}
                                onKeyDown={handleKeyDown}
                                disabled={isLoading}
                            />
                        </div>

                        <TaggedUrls
                            urls={urls}
                            onRemove={removeUrl}
                            onClearAll={clearAll}
                        />

                        <SubmitButton
                            isLoading={isLoading}
                            disabled={!canSubmit}
                            count={urls.length}
                        />
                    </form>

                    {urls.length === 0 && !isLoading && results.length === 0 && (
                        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                            <FiLink
                                className="mx-auto text-slate-400 dark:text-slate-600"
                                size={28}
                                aria-hidden="true"
                            />
                            <p className="mt-3 font-medium text-slate-600 dark:text-slate-300">
                                Nothing queued yet
                            </p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Add a URL above to see its title, description and preview
                                image.
                            </p>
                            <button
                                type="button"
                                onClick={loadSamples}
                                className="mt-4 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Try some examples
                            </button>
                        </div>
                    )}

                    {isLoading && <ResultsSkeleton count={Math.min(urls.length || 1, 3)} />}

                    {!isLoading && results.length > 0 && (
                        <ResultsSection
                            results={results}
                            summary={summary}
                            copied={copied}
                            onCopyJson={copyJson}
                            onDownloadJson={downloadJson}
                            onDownloadCsv={downloadCsv}
                        />
                    )}
                </div>
            </main>

            <Footer />

            <ToastContainer
                position="bottom-right"
                autoClose={3500}
                limit={3}
                newestOnTop
                theme={theme}
                aria-label="Notifications"
            />
        </div>
    );
}

export default App;
