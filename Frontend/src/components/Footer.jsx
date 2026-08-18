const REPO_URL = 'https://github.com/DotanVG/react-node-url-metadata-fetcher';

const Footer = () => (
    <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p>
            Built by{' '}
            <a
                href="https://github.com/DotanVG"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
                Dotan Veretzky
            </a>
            {' · '}
            <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
                Source on GitHub
            </a>
        </p>
    </footer>
);

export default Footer;
