import { FiCheck, FiCopy, FiDownload } from 'react-icons/fi';

const buttonClasses =
    'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

const ResultActions = ({ onCopyJson, onDownloadJson, onDownloadCsv, copied }) => (
    <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCopyJson} className={buttonClasses}>
            {copied ? (
                <FiCheck size={15} className="text-emerald-600" aria-hidden="true" />
            ) : (
                <FiCopy size={15} aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy JSON'}
        </button>

        <button type="button" onClick={onDownloadJson} className={buttonClasses}>
            <FiDownload size={15} aria-hidden="true" /> JSON
        </button>

        <button type="button" onClick={onDownloadCsv} className={buttonClasses}>
            <FiDownload size={15} aria-hidden="true" /> CSV
        </button>
    </div>
);

export default ResultActions;
