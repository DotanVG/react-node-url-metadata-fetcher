const TRACK = 'stroke-slate-200 dark:stroke-slate-700';

/** Emerald / amber / rose, matching the thresholds used in the audit legend. */
const scoreTone = (score) => {
    if (score >= 80) return 'emerald';
    if (score >= 50) return 'amber';
    return 'rose';
};

const STROKE = {
    emerald: 'stroke-emerald-500',
    amber: 'stroke-amber-500',
    rose: 'stroke-rose-500',
};

const TEXT = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
};

/**
 * Compact progress donut. The number is rendered as real text rather than
 * inside the SVG, so it scales with the user's font settings and is readable
 * by assistive tech.
 */
const ScoreRing = ({ score, size = 44, strokeWidth = 4 }) => {
    const tone = scoreTone(score);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const filled = (Math.min(Math.max(score, 0), 100) / 100) * circumference;

    return (
        <div
            className="relative shrink-0"
            style={{ width: size, height: size }}
            role="img"
            aria-label={`Metadata score ${score} out of 100`}
        >
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    className={TRACK}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${filled} ${circumference}`}
                    className={`${STROKE[tone]} transition-[stroke-dasharray] duration-700 ease-out`}
                />
            </svg>
            <span
                className={`absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums ${TEXT[tone]}`}
                aria-hidden="true"
            >
                {score}
            </span>
        </div>
    );
};

export default ScoreRing;
