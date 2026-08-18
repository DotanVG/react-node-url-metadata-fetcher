import MetadataItem from './MetadataItem.jsx';
import ResultActions from './ResultActions.jsx';

const ResultsSection = ({ results, summary, ...actions }) => (
    <section className="mt-10" aria-labelledby="results-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                        {summary.failed > 0 ? ` · ${summary.failed} failed` : ''}
                    </p>
                )}
            </div>
            <ResultActions {...actions} />
        </div>

        <ul className="space-y-4">
            {results.map((item, index) => (
                <MetadataItem key={`${item.url}-${index}`} item={item} />
            ))}
        </ul>
    </section>
);

export default ResultsSection;
