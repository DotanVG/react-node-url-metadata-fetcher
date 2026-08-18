const ResultsSkeleton = ({ count = 3 }) => (
    <section className="mt-10" aria-hidden="true">
        <div className="mb-4 h-6 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <ul className="space-y-4">
            {Array.from({ length: count }, (_, index) => (
                <li
                    key={index}
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white sm:flex-row dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="h-40 w-full animate-pulse bg-slate-200 sm:h-auto sm:min-h-[9rem] sm:w-56 dark:bg-slate-800" />
                    <div className="flex-1 space-y-3 p-4">
                        <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </div>
                </li>
            ))}
        </ul>
    </section>
);

export default ResultsSkeleton;
