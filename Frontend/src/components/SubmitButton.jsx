import { FiLoader, FiZap } from 'react-icons/fi';

const SubmitButton = ({ isLoading, disabled, count }) => (
    <button
        type="submit"
        disabled={disabled || isLoading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900"
    >
        {isLoading ? (
            <>
                <FiLoader className="animate-spin" size={18} aria-hidden="true" />
                Fetching metadata…
            </>
        ) : (
            <>
                <FiZap size={18} aria-hidden="true" />
                Fetch metadata
                {count > 0 ? ` for ${count} URL${count === 1 ? '' : 's'}` : ''}
            </>
        )}
    </button>
);

export default SubmitButton;
