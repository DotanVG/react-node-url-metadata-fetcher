import { FiPlus, FiX } from 'react-icons/fi';

const UrlInput = ({ value, onChange, onAdd, onClear, onKeyDown, disabled }) => (
    <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-grow">
            <label htmlFor="url-input" className="sr-only">
                Web address
            </label>
            <input
                id="url-input"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-9 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                placeholder="example.com, or paste several URLs at once"
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                aria-describedby="url-input-hint"
            />
            {value && (
                <button
                    type="button"
                    onClick={onClear}
                    aria-label="Clear the address field"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-slate-200"
                >
                    <FiX size={16} />
                </button>
            )}
        </div>

        <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
            <FiPlus size={16} aria-hidden="true" /> Add
        </button>
    </div>
);

export default UrlInput;
