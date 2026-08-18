import { FiGithub, FiMoon, FiSun } from 'react-icons/fi';

import BackendStatus from './BackendStatus.jsx';

const REPO_URL = 'https://github.com/DotanVG/react-node-url-metadata-fetcher';

const Navbar = ({ theme, onToggleTheme, backend }) => (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                    URL Metadata Fetcher
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    See what any link looks like when it is shared.
                </p>
            </div>

            <div className="flex items-center gap-3">
                <BackendStatus
                    status={backend.status}
                    elapsedSeconds={backend.elapsedSeconds}
                    onRetry={backend.retry}
                />

                <button
                    type="button"
                    onClick={onToggleTheme}
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                    className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    {theme === 'dark' ? <FiSun size={20} /> : <FiMoon size={20} />}
                </button>

                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View this project on GitHub"
                    title="View this project on GitHub"
                    className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    <FiGithub size={20} />
                </a>
            </div>
        </div>
    </header>
);

export default Navbar;
