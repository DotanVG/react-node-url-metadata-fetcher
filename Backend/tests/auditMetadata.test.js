import { auditMetadata, IMPORTANCE, STATUS } from '../src/auditMetadata.js';
import { extractMetadata } from '../src/extractMetadata.js';

const BASE = 'https://example.com/page';
const audit = (html) => auditMetadata(extractMetadata(html, BASE));
const field = (result, key) => result.fields.find((f) => f.key === key);

const FULL_PAGE = `<html lang="en">
  <head>
    <meta property="og:title" content="Title">
    <meta property="og:description" content="Description">
    <meta property="og:image" content="/hero.png">
    <meta property="og:image:alt" content="Alt text">
    <meta property="og:site_name" content="Example">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="en_GB">
    <meta name="author" content="Ada">
    <meta name="theme-color" content="#000">
    <meta name="keywords" content="a,b">
    <meta property="article:published_time" content="2024-01-01">
    <link rel="canonical" href="/page">
    <link rel="icon" href="/icon.png">
  </head>
</html>`;

describe('auditMetadata', () => {
    it('marks a tag the page actually published as published', () => {
        const result = audit('<html><head><meta property="og:title" content="T"></head></html>');

        expect(field(result, 'title')).toMatchObject({
            status: STATUS.PUBLISHED,
            source: 'og',
            importance: IMPORTANCE.ESSENTIAL,
        });
    });

    it('marks a value we worked out ourselves as inferred, not published', () => {
        // No og:site_name and no declared icon: both get filled in by us.
        const result = audit('<html><head><title>T</title></head></html>');

        expect(field(result, 'siteName')).toMatchObject({
            status: STATUS.INFERRED,
            source: 'derived',
        });
        expect(field(result, 'favicon')).toMatchObject({
            status: STATUS.INFERRED,
            source: 'derived',
        });
    });

    it('marks an absent tag as missing with no source', () => {
        const result = audit('<html><head><title>T</title></head></html>');

        expect(field(result, 'image')).toMatchObject({
            status: STATUS.MISSING,
            source: null,
        });
    });

    it('records where a value came from when a fallback wins', () => {
        const result = audit(
            '<html><head><title>From HTML</title><meta name="twitter:description" content="D"></head></html>'
        );

        expect(field(result, 'title').source).toBe('html');
        expect(field(result, 'description').source).toBe('twitter');
    });

    it('scores a fully tagged page at 100', () => {
        const result = audit(FULL_PAGE);

        expect(result.score).toBe(100);
        expect(result.missing).toBe(0);
        expect(result.inferred).toBe(0);
        expect(result.published).toBe(result.total);
    });

    it('counts published, inferred and missing so they always sum to the total', () => {
        for (const html of [FULL_PAGE, '<html></html>', '<html><head><title>T</title></head></html>']) {
            const result = audit(html);
            expect(result.published + result.inferred + result.missing).toBe(result.total);
        }
    });

    it('weights an essential tag above an optional one', () => {
        const withoutImage = audit(
            FULL_PAGE.replace('<meta property="og:image" content="/hero.png">', '')
        );
        const withoutKeywords = audit(
            FULL_PAGE.replace('<meta name="keywords" content="a,b">', '')
        );

        expect(withoutImage.score).toBeLessThan(withoutKeywords.score);
    });

    it('gives an inferred value half the credit of a published one', () => {
        const published = audit(FULL_PAGE);
        const inferred = audit(
            FULL_PAGE.replace('<meta property="og:site_name" content="Example">', '')
        );
        const missing = audit(
            FULL_PAGE.replace('<meta property="og:site_name" content="Example">', '')
                .replace('<link rel="icon" href="/icon.png">', '')
        );

        expect(inferred.score).toBeLessThan(published.score);
        expect(missing.score).toBeLessThan(inferred.score);
    });

    it('names the missing essential tags so a caller can act on them', () => {
        const result = audit('<html><head><title>Only a title</title></head></html>');

        expect(result.missingEssential).toEqual(['og:description', 'og:image']);
        // The title resolved from <title>, so it is not in the missing list.
        expect(result.missingEssential).not.toContain('og:title');
    });

    it('reports no missing essentials for a well-tagged page', () => {
        expect(audit(FULL_PAGE).missingEssential).toEqual([]);
    });

    it('scores a bare page low without crashing', () => {
        const result = audit('<html></html>');

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThan(20);
        expect(result.missingEssential).toEqual(['og:title', 'og:description', 'og:image']);
    });

    it('gives every field an actionable tag name and hint', () => {
        for (const entry of audit(FULL_PAGE).fields) {
            expect(entry.tag).toBeTruthy();
            expect(entry.hint.length).toBeGreaterThan(20);
            expect(Object.values(IMPORTANCE)).toContain(entry.importance);
        }
    });

    it('treats an empty keywords list as missing rather than present', () => {
        const result = audit('<html><head><meta name="keywords" content="  ,  "></head></html>');

        expect(field(result, 'keywords').status).toBe(STATUS.MISSING);
    });
});

describe('extractMetadata sources', () => {
    it('reports no source for a value that resolved away as unsafe', () => {
        const metadata = extractMetadata(
            '<html><head><meta property="og:image" content="javascript:alert(1)"></head></html>',
            BASE
        );

        expect(metadata.image).toBe('');
        expect(metadata.sources.image).toBeNull();
    });

    it('keeps the flat fields alongside the sources map', () => {
        const metadata = extractMetadata(
            '<html><head><meta property="og:title" content="T"></head></html>',
            BASE
        );

        expect(metadata.title).toBe('T');
        expect(metadata.sources.title).toBe('og');
    });
});

describe('auditMetadata context', () => {
    const WEBSITE = FULL_PAGE.replace('content="article"', 'content="website"').replace(
        '<meta property="article:published_time" content="2024-01-01">',
        ''
    );

    it('does not penalise a missing published date on og:type=website', () => {
        const result = audit(WEBSITE);
        expect(field(result, 'publishedAt')).toMatchObject({ status: STATUS.MISSING, scored: false });
        expect(result.score).toBe(100);
    });

    it('still scores a missing published date on an article', () => {
        const result = audit(
            FULL_PAGE.replace('<meta property="article:published_time" content="2024-01-01">', '')
        );
        expect(result.score).toBeLessThan(100);
    });

    it('keeps keywords informational and out of the score', () => {
        const result = audit(FULL_PAGE.replace('<meta name="keywords" content="a,b">', ''));
        expect(field(result, 'keywords').scored).toBe(false);
        expect(result.score).toBe(100);
    });
});

describe('auditMetadata indexability', () => {
    const withRobots = (content) =>
        FULL_PAGE.replace('</head>', `<meta name="robots" content="${content}"></head>`);

    it('flags noindex in meta robots and caps the score', () => {
        const result = audit(withRobots('noindex, follow'));
        expect(result.indexable).toBe(false);
        expect(result.score).toBe(50);
        expect(result.warnings[0].level).toBe('error');
        expect(result.warnings[0].message).toMatch(/meta robots/);
    });

    it('flags "none" in a googlebot meta tag', () => {
        const result = audit('<html><head><meta name="googlebot" content="none"></head></html>');
        expect(result.indexable).toBe(false);
    });

    it('flags noindex in the X-Robots-Tag header', () => {
        const result = auditMetadata(extractMetadata(FULL_PAGE, BASE), {
            robotsHeader: 'googlebot: noindex',
        });
        expect(result.indexable).toBe(false);
        expect(result.warnings[0].message).toMatch(/X-Robots-Tag/);
    });

    it('treats "index, follow" as indexable', () => {
        const result = audit(withRobots('index, follow'));
        expect(result.indexable).toBe(true);
        expect(result.warnings.filter((w) => w.level === 'error')).toEqual([]);
    });
});

describe('auditMetadata image and JSON-LD warnings', () => {
    const messages = (result) => result.warnings.map((w) => w.message).join('\n');
    const absolutePage = FULL_PAGE.replace('/hero.png', 'https://example.com/hero.png');

    it('warns when og:image is relative', () => {
        expect(messages(audit(FULL_PAGE))).toMatch(/relative URL/);
        expect(messages(audit(absolutePage))).not.toMatch(/relative URL/);
    });

    it('reports a broken, mis-shaped or heavy image', () => {
        const metadata = extractMetadata(absolutePage, BASE);
        const check = (image) => messages(auditMetadata(metadata, { image }));

        expect(check({ ok: false, status: 404, contentType: 'text/html' })).toMatch(/HTTP 404/);
        expect(check({ ok: false, status: 200, contentType: 'text/html' })).toMatch(/not an image/);
        expect(check({ ok: false, error: 'timed out' })).toMatch(/could not be fetched/);
        expect(check({ ok: true, status: 200, width: 800, height: 800, bytes: 1000 })).toMatch(
            /1\.91:1/
        );
        expect(
            check({ ok: true, status: 200, width: 1200, height: 630, bytes: 3_000_000 })
        ).toMatch(/2\.9 MB/);
        expect(check({ ok: true, status: 200, width: 1200, height: 630, bytes: 90_000 })).toBe('');
    });

    it('reports JSON-LD parse errors and the @types found', () => {
        const result = audit(`<html><head>
            <script type="application/ld+json">{ broken </script>
            <script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["Person","Thing"]}]}</script>
        </head></html>`);

        expect(result.jsonLd.types).toEqual(['WebSite', 'Person', 'Thing']);
        expect(result.jsonLd.errors).toHaveLength(1);
        expect(messages(result)).toMatch(/1 JSON-LD block/);
    });
});
