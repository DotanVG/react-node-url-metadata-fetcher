import * as cheerio from 'cheerio';

const MAX_TEXT_LENGTH = 1000;

/**
 * Pulls the useful bits out of a page's HTML.
 *
 * Order of preference throughout: Open Graph → Twitter Card → JSON-LD →
 * plain HTML. That is the order publishers actually curate, so it gives the
 * closest thing to "what this link looks like when shared".
 */
export function extractMetadata(html, baseUrl) {
    const $ = cheerio.load(html);
    const jsonLd = readJsonLd($);

    const meta = (selector, attribute = 'content') =>
        clean($(selector).first().attr(attribute));

    const title =
        meta('meta[property="og:title"]') ||
        meta('meta[name="og:title"]') ||
        meta('meta[name="twitter:title"]') ||
        clean(jsonLd.headline || jsonLd.name) ||
        clean($('title').first().text()) ||
        clean($('h1').first().text()) ||
        '';

    const description =
        meta('meta[property="og:description"]') ||
        meta('meta[name="og:description"]') ||
        meta('meta[name="twitter:description"]') ||
        meta('meta[name="description"]') ||
        clean(jsonLd.description) ||
        '';

    const image = absolute(
        meta('meta[property="og:image:secure_url"]') ||
            meta('meta[property="og:image:url"]') ||
            meta('meta[property="og:image"]') ||
            meta('meta[name="og:image"]') ||
            meta('meta[name="twitter:image"]') ||
            meta('meta[name="twitter:image:src"]') ||
            meta('link[rel="image_src"]', 'href') ||
            clean(firstJsonLdImage(jsonLd)),
        baseUrl
    );

    const siteName =
        meta('meta[property="og:site_name"]') ||
        meta('meta[name="application-name"]') ||
        hostnameOf(baseUrl);

    return {
        title: truncate(title),
        description: truncate(description),
        image,
        imageAlt: truncate(
            meta('meta[property="og:image:alt"]') ||
                meta('meta[name="twitter:image:alt"]') ||
                '',
            200
        ),
        siteName: truncate(siteName, 200),
        favicon: findFavicon($, baseUrl),
        type: meta('meta[property="og:type"]') || '',
        author: truncate(
            meta('meta[name="author"]') ||
                meta('meta[property="article:author"]') ||
                clean(authorFromJsonLd(jsonLd)) ||
                '',
            200
        ),
        publishedAt:
            meta('meta[property="article:published_time"]') ||
            meta('meta[name="date"]') ||
            clean(jsonLd.datePublished) ||
            '',
        canonicalUrl: absolute(meta('link[rel="canonical"]', 'href'), baseUrl),
        locale:
            meta('meta[property="og:locale"]') ||
            clean($('html').attr('lang')) ||
            '',
        themeColor: meta('meta[name="theme-color"]') || '',
        keywords: splitKeywords(meta('meta[name="keywords"]')),
    };
}

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
        const href = $(selector).first().attr('href');
        const resolved = absolute(clean(href), baseUrl);
        if (resolved) return resolved;
    }

    // Nearly every site serves /favicon.ico even without declaring it.
    return absolute('/favicon.ico', baseUrl);
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
