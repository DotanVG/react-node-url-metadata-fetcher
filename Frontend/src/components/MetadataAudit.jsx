import { useId, useState } from 'react';
import {
    FiAlertTriangle,
    FiCheckCircle,
    FiChevronDown,
    FiMinusCircle,
    FiXCircle,
} from 'react-icons/fi';

import ScoreRing from './ScoreRing.jsx';

const GROUPS = [
    {
        importance: 'essential',
        title: 'Essential',
        blurb: 'Without these the link preview barely renders.',
    },
    {
        importance: 'recommended',
        title: 'Recommended',
        blurb: 'Present on well-tagged pages.',
    },
    {
        importance: 'optional',
        title: 'Nice to have',
        blurb: 'Small refinements. Safe to skip.',
    },
];

/**
 * Row appearance per status. A missing *essential* tag is the only thing that
 * earns a red mark. Flagging an absent `theme-color` in the same red would
 * train people to ignore the whole panel.
 */
function presentation(status, importance) {
    if (status === 'published') {
        return {
            Icon: FiCheckCircle,
            className: 'text-emerald-600 dark:text-emerald-400',
            word: 'Published',
        };
    }
    if (status === 'inferred') {
        return {
            Icon: FiAlertTriangle,
            className: 'text-amber-600 dark:text-amber-400',
            word: 'Inferred',
        };
    }
    if (importance === 'essential') {
        return {
            Icon: FiXCircle,
            className: 'text-rose-600 dark:text-rose-400',
            word: 'Missing',
        };
    }
    return {
        Icon: FiMinusCircle,
        className: 'text-slate-400 dark:text-slate-500',
        word: 'Not set',
    };
}

const SOURCE_LABELS = {
    og: 'Open Graph',
    twitter: 'Twitter Card',
    jsonld: 'JSON-LD',
    html: 'HTML',
    derived: 'Guessed by us',
};

/** Short, readable rendering of whatever the field actually holds. */
function preview(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value !== 'string' || !value) return '';
    const stripped = value.replace(/^https?:\/\//, '');
    return stripped.length > 90 ? `${stripped.slice(0, 89)}…` : stripped;
}

const Tally = ({ Icon, className, count, label }) => (
    <span className={`inline-flex items-center gap-1 ${className}`}>
        <Icon size={13} aria-hidden="true" />
        <span className="tabular-nums">{count}</span>
        <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
);

/**
 * Collapsible breakdown of which metadata a page publishes, which we had to
 * infer, and which is absent, with the tag needed to fix each gap.
 */
const MetadataAudit = ({ audit, result }) => {
    const [isOpen, setIsOpen] = useState(false);
    const panelId = useId();

    if (!audit?.fields?.length) return null;

    return (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60"
            >
                <ScoreRing score={audit.score} />

                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                        Metadata Analysis
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <Tally
                            Icon={FiCheckCircle}
                            className="text-emerald-600 dark:text-emerald-400"
                            count={audit.published}
                            label="published"
                        />
                        {audit.inferred > 0 && (
                            <Tally
                                Icon={FiAlertTriangle}
                                className="text-amber-600 dark:text-amber-400"
                                count={audit.inferred}
                                label="inferred"
                            />
                        )}
                        <Tally
                            Icon={FiXCircle}
                            className={
                                audit.missingEssential.length > 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-400 dark:text-slate-500'
                            }
                            count={audit.missing}
                            label="missing"
                        />
                    </span>
                </span>

                <FiChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {audit.missingEssential.length > 0 && !isOpen && (
                <p className="mt-2 px-1 text-xs text-rose-700 dark:text-rose-300">
                    Missing {audit.missingEssential.join(', ')}. The preview will
                    look broken on most platforms.
                </p>
            )}

            {isOpen && (
                <div id={panelId} className="mt-3 space-y-4">
                    {GROUPS.map((group) => {
                        const rows = audit.fields.filter(
                            (field) => field.importance === group.importance
                        );
                        if (rows.length === 0) return null;

                        return (
                            <section key={group.importance}>
                                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {group.title}
                                    <span className="ml-2 font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                                        {group.blurb}
                                    </span>
                                </h5>

                                <ul className="mt-1.5 divide-y divide-slate-100 dark:divide-slate-800">
                                    {rows.map((field) => {
                                        const { Icon, className, word } = presentation(
                                            field.status,
                                            field.importance
                                        );
                                        const value = preview(result?.[field.key]);

                                        return (
                                            <li
                                                key={field.key}
                                                className="flex items-start gap-2.5 py-2"
                                            >
                                                <Icon
                                                    size={15}
                                                    className={`mt-0.5 shrink-0 ${className}`}
                                                    aria-hidden="true"
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                            {field.label}
                                                        </span>
                                                        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                            {field.tag}
                                                        </code>
                                                        {field.source && (
                                                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                                                via{' '}
                                                                {SOURCE_LABELS[field.source] ??
                                                                    field.source}
                                                            </span>
                                                        )}
                                                        {/* Status in words, so the meaning
                                                            does not rely on colour alone. */}
                                                        <span className={`text-[11px] ${className}`}>
                                                            {word}
                                                        </span>
                                                    </div>

                                                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                                        {value || field.hint}
                                                    </p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MetadataAudit;
