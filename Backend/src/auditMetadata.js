import { HEAVY_IMAGE_BYTES } from './checkImage.js';
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
 * it. The point of the audit is to be actionable, not just to keep score.
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
        hint: 'Tells platforms whether this is a website, article or video so they lay it out correctly.',
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
        hint: 'Lets readers see how current the page is. Only scored when og:type is article.',
        // article:* tags mean nothing on a website or profile page.
        appliesTo: (metadata) => /^article/i.test(metadata.type ?? ''),
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
        hint: 'Not scored: search engines ignore it. Shown for information only.',
        appliesTo: () => false,
    },
];

// A noindex page cannot be found from search no matter how well it is tagged,
// so it can never score better than this.
const NOINDEX_SCORE_CAP = 50;
const OG_ASPECT_RATIO = 1.91;

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
 *
 * `robotsHeader` is the page's X-Robots-Tag; `image` is the checkImage()
 * result for the preview image, if it was probed.
 */
export function auditMetadata(metadata, { robotsHeader = '', image = null } = {}) {
    const sources = metadata.sources ?? {};
    const signals = metadata.signals ?? {};

    const fields = AUDITED_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        tag: field.tag,
        importance: field.importance,
        hint: field.hint,
        status: statusFor(metadata[field.key], sources[field.key]),
        source: sources[field.key] ?? null,
        scored: field.appliesTo ? field.appliesTo(metadata) : true,
    }));

    let earned = 0;
    let possible = 0;
    const counts = {
        [STATUS.PUBLISHED]: 0,
        [STATUS.INFERRED]: 0,
        [STATUS.MISSING]: 0,
    };

    for (const field of fields) {
        counts[field.status] += 1;
        if (!field.scored) continue;
        const weight = WEIGHTS[field.importance];
        possible += weight;
        earned += weight * CREDIT[field.status];
    }

    const noindex = [
        ['meta robots', signals.robots],
        ['X-Robots-Tag header', robotsHeader, true],
    ].filter(([, value, allowUserAgent]) => hasNoindex(value, allowUserAgent));

    const warnings = [];
    if (noindex.length > 0) {
        warnings.push({
            level: 'error',
            message: `Not indexable: noindex set in ${noindex.map(([where]) => where).join(' and ')}. Search engines will drop this page.`,
        });
    }
    warnings.push(...imageWarnings(metadata, signals, image));
    const jsonLd = signals.jsonLd ?? { types: [], errors: [] };
    if (jsonLd.errors.length > 0) {
        warnings.push({
            level: 'warning',
            message: `${jsonLd.errors.length} JSON-LD block(s) failed to parse and are ignored by search engines: ${jsonLd.errors[0]}`,
        });
    }

    let score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
    if (noindex.length > 0) score = Math.min(score, NOINDEX_SCORE_CAP);

    return {
        score,
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
        indexable: noindex.length === 0,
        image,
        jsonLd,
        warnings,
        fields,
    };
}

// These colons introduce directive values, not user-agent prefixes.
const PARAMETERIZED_ROBOTS = new Set([
    'max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after',
]);

/** Only standalone `noindex` / `none`, optionally scoped in X-Robots-Tag. */
const hasNoindex = (directives, allowUserAgent = false) =>
    (directives ?? '').split(',').some((entry) => {
        let directive = entry.trim().toLowerCase();
        const colon = directive.indexOf(':');
        if (allowUserAgent && colon !== -1 &&
            !PARAMETERIZED_ROBOTS.has(directive.slice(0, colon).trim())) {
            directive = directive.slice(colon + 1).trim();
        }
        return directive === 'noindex' || directive === 'none';
    });

function imageWarnings(metadata, signals, image) {
    const warnings = [];
    const warn = (message, level = 'warning') => warnings.push({ level, message });
    const declared = signals.imageDeclared ?? '';

    if (declared && metadata.image && !/^https?:\/\//i.test(declared)) {
        warn(`Preview image is a relative URL ("${declared}"). Facebook, LinkedIn and others need an absolute https:// URL.`);
    }
    if (!image) return warnings;

    if (image.error) {
        warn(`Preview image could not be fetched: ${image.error}`, 'error');
    } else if (image.status >= 400) {
        warn(`Preview image returns HTTP ${image.status}, so previews will show no image.`, 'error');
    } else if (!image.ok) {
        warn(`Preview image is served as "${image.contentType || 'unknown'}", not an image.`, 'error');
    }

    if (image.width && image.height) {
        const ratio = image.width / image.height;
        if (Math.abs(ratio - OG_ASPECT_RATIO) / OG_ASPECT_RATIO > 0.1) {
            warn(`Preview image is ${image.width}×${image.height} (${ratio.toFixed(2)}:1). Large cards expect 1.91:1, e.g. 1200×630, and will crop it.`);
        }
    }
    if (image.bytes > HEAVY_IMAGE_BYTES) {
        warn(`Preview image weighs ${(image.bytes / 1024 / 1024).toFixed(1)} MB. Keep it under 1 MB or some platforms skip it.`);
    }
    return warnings;
}
