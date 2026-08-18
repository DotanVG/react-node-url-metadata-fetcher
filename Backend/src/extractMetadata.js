import * as cheerio from 'cheerio';

const MAX_TEXT_LENGTH = 1000;

/**
 * Where a value came from. Reported alongside the value because the source is
 * itself useful: a title that came from `<title>` rather than `og:title` still
 * renders, but it is not what the page told social platforms to show.
 *
 * `derived` means we worked the value out ourselves — the page never published
 * it — so it must never be presented as something the author provided.
 */
export const SOURCES = {
    OG: 'og',
    TWITTER: 'twitter',
    JSON_LD: 'jsonld',
    HTML: 'html',
    DERIVED: 'derived',
};

/**
 * Pulls the useful bits out of a page's HTML.
 *
 * Order of preference throughout: Open Graph → Twitter Card → JSON-LD →
 * plain HTML. That is the order publishers actually curate, so it gives the
 * closest thing to "what this link looks like when shared".
 *
 * Returns the flat metadata fields plus a `sources` map naming the winning
 * source for each one.
 */
export function extractMetadata(html, baseUrl) {
    const $ = cheerio.load(html);
    const jsonLd = readJsonLd($);

    const meta = (selector, attribute = 'content') =>
        clean($(selector).first().attr(attribute));

    const title = pick(
        [meta('meta[property="og:title"]'), SOURCES.OG],
        [meta('meta[name="og:title"]'), SOURCES.OG],
        [meta('meta[name="twitter:title"]'), SOURCES.TWITTER],
        [clean(jsonLd.headline || jsonLd.name), SOURCES.JSON_LD],
        [clean($('title').first().text()), SOURCES.HTML],
        [clean($('h1').first().text()), SOURCES.HTML]
    );

    const description = pick(
        [meta('meta[property="og:description"]'), SOURCES.OG],
        [meta('meta[name="og:description"]'), SOURCES.OG],
        [meta('meta[name="twitter:description"]'), SOURCES.TWITTER],
        [meta('meta[name="description"]'), SOURCES.HTML],
        [clean(jsonLd.description), SOURCES.JSON_LD]
    );

    const image = pick(
        [meta('meta[property="og:image:secure_url"]'), SOURCES.OG],
        [meta('meta[property="og:image:url"]'), SOURCES.OG],
        [meta('meta[property="og:image"]'), SOURCES.OG],
        [meta('meta[name="og:image"]'), SOURCES.OG],
        [meta('meta[name="twitter:image"]'), SOURCES.TWITTER],
        [meta('meta[name="twitter:image:src"]'), SOURCES.TWITTER],
        [meta('link[rel="image_src"]', 'href'), SOURCES.HTML],
        [clean(firstJsonLdImage(jsonLd)), SOURCES.JSON_LD]
    );

    const imageAlt = pick(
        [meta('meta[property="og:image:alt"]'), SOURCES.OG],
        [meta('meta[name="twitter:image:alt"]'), SOURCES.TWITTER]
    );

    // The hostname is a fallback, not something the page published — hence
    // `derived`, so an audit never credits the page for it.
    const siteName = pick(
        [meta('meta[property="og:site_name"]'), SOURCES.OG],
        [meta('meta[name="application-name"]'), SOURCES.HTML],
        [hostnameOf(baseUrl), SOURCES.DERIVED]
    );

    const author = pick(
        [meta('meta[name="author"]'), SOURCES.HTML],
        [meta('meta[property="article:author"]'), SOURCES.OG],
        [clean(authorFromJsonLd(jsonLd)), SOURCES.JSON_LD]
    );

    const publishedAt = pick(
        [meta('meta[property="article:published_time"]'), SOURCES.OG],
        [meta('meta[name="date"]'), SOURCES.HTML],
        [clean(jsonLd.datePublished), SOURCES.JSON_LD]
    );

    const locale = pick(
        [meta('meta[property="og:locale"]'), SOURCES.OG],
        [clean($('html').attr('lang')), SOURCES.HTML]
    );

    const type = pick([meta('meta[property="og:type"]'), SOURCES.OG]);
    const themeColor = pick([meta('meta[name="theme-color"]'), SOURCES.HTML]);
    const canonical = pick([meta('link[rel="canonical"]', 'href'), SOURCES.HTML]);
    const favicon = findFavicon($, baseUrl);
    const keywords = pick([meta('meta[name="keywords"]'), SOURCES.HTML]);

    const fields = {
        title: withValue(title, truncate(title.value)),
        description: withValue(description, truncate(description.value)),
        image: withValue(image, absolute(image.value, baseUrl)),
        imageAlt: withValue(imageAlt, truncate(imageAlt.value, 200)),
        siteName: withValue(siteName, truncate(siteName.value, 200)),
        favicon: withValue(favicon, absolute(favicon.value, baseUrl)),
        type: type,
        author: withValue(author, truncate(author.value, 200)),
        publishedAt: publishedAt,
        canonicalUrl: withValue(canonical, absolute(canonical.value, baseUrl)),
        locale: locale,
        themeColor: themeColor,
        keywords: withValue(keywords, splitKeywords(keywords.value)),
    };

    const metadata = {};
    const sources = {};
    for (const [key, field] of Object.entries(fields)) {
        metadata[key] = field.value;
        // A value that resolved away to nothing (a javascript: image, say)
        // has no source to report.
        sources[key] = isEmpty(field.value) ? null : field.source;
    }

    return { ...metadata, sources };
}

/** First non-empty candidate wins, carrying its source along. */
function pick(...candidates) {
    for (const [value, source] of candidates) {
        if (value) return { value, source };
    }
    return { value: '', source: null };
}

const withValue = (field, value) => ({ value, source: field.source });

const isEmpty = (value) => (Array.isArray(value) ? value.length === 0 : !value);

/** Collapses whitespace and trims — page titles love stray newlines. */
function clean(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function truncate(value, max = MAX_TEXT_LENGTH) {
    if (!value) return '';
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function absolute(value, baseUrl) {
    if (!value) return '';
    try {
        const resolved = new URL(value, baseUrl);
        // Never hand the client a javascript: or data: URL to render.
        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            return '';
        }
        return resolved.href;
    } catch {
        return '';
    }
}

function hostnameOf(baseUrl) {
    try {
        return new URL(baseUrl).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function findFavicon($, baseUrl) {
    const candidates = [
        'link[rel="apple-touch-icon"]',
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="alternate icon"]',
        'link[rel="mask-icon"]',
    ];

    for (const selector of candidates) {
        const href = clean($(selector).first().attr('href'));
        if (href && absolute(href, baseUrl)) {
            return { value: href, source: SOURCES.HTML };
        }
    }

    // Nearly every site serves /favicon.ico even without declaring it, but
    // guessing is not the same as the page declaring an icon.
    return { value: '/favicon.ico', source: SOURCES.DERIVED };
}

function splitKeywords(value) {
    if (!value) return [];
    return value
        .split(',')
        .map((keyword) => clean(keyword))
        .filter(Boolean)
        .slice(0, 15);
}

/** Merges every JSON-LD block on the page into one lookup object. */
function readJsonLd($) {
    const merged = {};

    $('script[type="application/ld+json"]').each((_, element) => {
        const raw = $(element).contents().text();
        if (!raw?.trim()) return;

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return; // Malformed JSON-LD is extremely common; just skip it.
        }

        const entries = []
            .concat(parsed)
            .flatMap((entry) => (entry?.['@graph'] ? entry['@graph'] : entry));

        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;
            for (const [key, value] of Object.entries(entry)) {
                if (merged[key] === undefined && value !== null) {
                    merged[key] = value;
                }
            }
        }
    });

    return merged;
}

function firstJsonLdImage(jsonLd) {
    const image = jsonLd.image ?? jsonLd.thumbnailUrl;
    const candidate = Array.isArray(image) ? image[0] : image;
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate === 'object') return candidate.url || '';
    return '';
}

function authorFromJsonLd(jsonLd) {
    const author = Array.isArray(jsonLd.author) ? jsonLd.author[0] : jsonLd.author;
    if (typeof author === 'string') return author;
    if (author && typeof author === 'object') return author.name || '';
    return '';
}
