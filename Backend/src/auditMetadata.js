import { SOURCES } from './extractMetadata.js';

/**
 * How much each field matters to a link preview. A missing `og:image` breaks
 * the preview; a missing `og:image:alt` costs accessibility but nothing
 * visual; a missing `theme-color` costs almost nothing. Grading them all the
 * same would turn the audit into noise.
 */
export const IMPORTANCE = {
    ESSENTIAL: 'essential',
    RECOMMENDED: 'recommended',
    OPTIONAL: 'optional',
};

export const STATUS = {
    PUBLISHED: 'published', // the page declared it
    INFERRED: 'inferred', // we worked it out; the page did not say
    MISSING: 'missing',
};

const WEIGHTS = {
    [IMPORTANCE.ESSENTIAL]: 3,
    [IMPORTANCE.RECOMMENDED]: 2,
    [IMPORTANCE.OPTIONAL]: 1,
};

// An inferred value is better than nothing but worse than a declared one, so
// it earns half credit rather than passing as if the author had set it.
const CREDIT = {
    [STATUS.PUBLISHED]: 1,
    [STATUS.INFERRED]: 0.5,
    [STATUS.MISSING]: 0,
};

/**
 * The fields we grade, each with the tag an author would actually add to fix
 * it — the point of the audit is to be actionable, not just to keep score.
 */
export const AUDITED_FIELDS = [
    {
        key: 'title',
        label: 'Title',
        tag: 'og:title',
        importance: IMPORTANCE.ESSENTIAL,
        hint: 'The headline every platform shows. Without og:title the page falls back to <title>.',
    },
    {
        key: 'description',
        label: 'Description',
        tag: 'og:description',
        importance: IMPORTANCE.ESSENTIAL,
        hint: 'The summary under the headline. Missing it leaves the preview looking empty.',
    },
    {
        key: 'image',
        label: 'Preview image',
        tag: 'og:image',
        importance: IMPORTANCE.ESSENTIAL,
        hint: 'The single biggest driver of clicks. Without it the link renders as plain text.',
    },
    {
        key: 'siteName',
        label: 'Site name',
        tag: 'og:site_name',
        importance: IMPORTANCE.RECOMMENDED,
        hint: 'Names the publisher in the preview instead of showing a bare domain.',
    },
    {
        key: 'type',
        label: 'Content type',
        tag: 'og:type',
        importance: IMPORTANCE.RECOMMENDED,
        hint: 'Tells platforms what this is — website, article, video — so they lay it out correctly.',
    },
    {
        key: 'imageAlt',
        label: 'Image alt text',
        tag: 'og:image:alt',
        importance: IMPORTANCE.RECOMMENDED,
        hint: 'Describes the preview image for screen readers.',
    },
    {
        key: 'canonicalUrl',
        label: 'Canonical URL',
        tag: 'link[rel="canonical"]',
        importance: IMPORTANCE.RECOMMENDED,
        hint: 'Points duplicates at one address so shares and search rankings do not split.',
    },
    {
        key: 'favicon',
        label: 'Favicon',
        tag: 'link[rel="icon"]',
        importance: IMPORTANCE.RECOMMENDED,
        hint: 'The small icon beside the link. Undeclared icons fall back to /favicon.ico, which may not exist.',
    },
    {
        key: 'locale',
        label: 'Language',
        tag: 'og:locale',
        importance: IMPORTANCE.OPTIONAL,
        hint: 'Helps platforms pick the right typography and reading direction.',
    },
    {
        key: 'author',
        label: 'Author',
        tag: 'meta[name="author"]',
        importance: IMPORTANCE.OPTIONAL,
        hint: 'Credits a byline where the platform shows one.',
    },
    {
        key: 'publishedAt',
        label: 'Published date',
        tag: 'article:published_time',
        importance: IMPORTANCE.OPTIONAL,
        hint: 'Lets readers see how current the page is.',
    },
    {
        key: 'themeColor',
        label: 'Theme colour',
        tag: 'meta[name="theme-color"]',
        importance: IMPORTANCE.OPTIONAL,
        hint: 'Tints browser chrome on mobile to match the site.',
    },
    {
        key: 'keywords',
        label: 'Keywords',
        tag: 'meta[name="keywords"]',
        importance: IMPORTANCE.OPTIONAL,
        hint: 'Largely ignored by search engines today, but still used by some tools.',
    },
];

const isEmpty = (value) =>
    Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim();

function statusFor(value, source) {
    if (isEmpty(value)) return STATUS.MISSING;
    return source === SOURCES.DERIVED ? STATUS.INFERRED : STATUS.PUBLISHED;
}

/**
 * Grades one extracted result: what the page published, what we had to work
 * out for it, and what is simply absent.
 *
 * The score is weighted by importance and gives half credit for inferred
 * values, so it cannot be gamed by a page that publishes thirteen trivial
 * tags and no og:image.
 */
export function auditMetadata(metadata) {
    const sources = metadata.sources ?? {};

    const fields = AUDITED_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        tag: field.tag,
        importance: field.importance,
        hint: field.hint,
        status: statusFor(metadata[field.key], sources[field.key]),
        source: sources[field.key] ?? null,
    }));

    let earned = 0;
    let possible = 0;
    const counts = {
        [STATUS.PUBLISHED]: 0,
        [STATUS.INFERRED]: 0,
        [STATUS.MISSING]: 0,
    };

    for (const field of fields) {
        const weight = WEIGHTS[field.importance];
        possible += weight;
        earned += weight * CREDIT[field.status];
        counts[field.status] += 1;
    }

    return {
        score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
        published: counts[STATUS.PUBLISHED],
        inferred: counts[STATUS.INFERRED],
        missing: counts[STATUS.MISSING],
        total: fields.length,
        // The headline problems, so a caller can act without walking the list.
        missingEssential: fields
            .filter(
                (field) =>
                    field.status === STATUS.MISSING &&
                    field.importance === IMPORTANCE.ESSENTIAL
            )
            .map((field) => field.tag),
        fields,
    };
}
