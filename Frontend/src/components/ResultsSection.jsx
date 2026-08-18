import { useState } from 'react';
import { FiGrid, FiList } from 'react-icons/fi';

import MetadataItem from './MetadataItem.jsx';
import ResultActions from './ResultActions.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';

const layoutButtonClasses =
    'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

const ResultsSection = ({ results, summary, ...actions }) => {
    const [layout, setLayout] = useState('list');
    const isDesktop = useMediaQuery('(min-width: 640px)');
    const effectiveLayout = isDesktop ? layout : 'list';

    return (
        <section className="mt-10" aria-labelledby="results-heading">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h3
                        id="results-heading"
                        className="text-xl font-semibold text-slate-900 dark:text-white"
                    >
                        Results
                    </h3>
                    {summary && (
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                            {summary.succeeded} of {summary.requested} fetched
                            {summary.failed > 0 ? `, ${summary.failed} failed` : ''}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
                    {isDesktop && (
                        <div
                            className="inline-flex w-fit rounded-lg border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
                            role="group"
                            aria-label="Result layout"
                        >
                        <button
                            type="button"
                            onClick={() => setLayout('list')}
                            aria-pressed={layout === 'list'}
                            className={`${layoutButtonClasses} ${
                                layout === 'list'
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                            }`}
                        >
                            <FiList size={15} aria-hidden="true" /> List
                        </button>
                        <button
                            type="button"
                            onClick={() => setLayout('grid')}
                            aria-pressed={layout === 'grid'}
                            className={`${layoutButtonClasses} ${
                                layout === 'grid'
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                            }`}
                        >
                            <FiGrid size={15} aria-hidden="true" /> Grid
                        </button>
                        </div>
                    )}
                    <ResultActions {...actions} />
                </div>
            </div>

            <ul
                className={
                    effectiveLayout === 'grid'
                        ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3'
                        : 'space-y-4'
                }
            >
                {results.map((item, index) => (
                    <MetadataItem
                        key={`${item.url}-${index}`}
                        item={item}
                        layout={effectiveLayout}
                    />
                ))}
            </ul>
        </section>
    );
};

export default ResultsSection;
