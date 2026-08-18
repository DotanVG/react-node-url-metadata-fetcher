import { extractMetadata } from '../src/extractMetadata.js';

const BASE = 'https://example.com/articles/one';

describe('extractMetadata', () => {
    it('prefers Open Graph over the plain <title> and description', () => {
        const result = extractMetadata(
            `<html><head>
        <title>HTML title</title>
        <meta name="description" content="HTML description">
        <meta property="og:title" content="OG title">
        <meta property="og:description" content="OG description">
      </head></html>`,
            BASE
        );

        expect(result.title).toBe('OG title');
        expect(result.description).toBe('OG description');
    });

    it('falls back to Twitter Card tags, then to raw HTML', () => {
        const twitter = extractMetadata(
            `<html><head>
        <title>HTML title</title>
        <meta name="twitter:title" content="Twitter title">
        <meta name="twitter:description" content="Twitter description">
      </head></html>`,
            BASE
        );
        expect(twitter.title).toBe('Twitter title');
        expect(twitter.description).toBe('Twitter description');

        const plain = extractMetadata(
            '<html><head><title>Only a title</title></head><body><h1>Heading</h1></body></html>',
            BASE
        );
        expect(plain.title).toBe('Only a title');
        expect(plain.description).toBe('');
    });

    it('falls back to the <h1> when there is no <title>', () => {
        const result = extractMetadata('<html><body><h1>Heading</h1></body></html>', BASE);
        expect(result.title).toBe('Heading');
    });

    it('reads JSON-LD, including inside an @graph, and ignores malformed blocks', () => {
        const result = extractMetadata(
            `<html><head>
        <script type="application/ld+json">{ not json }</script>
        <script type="application/ld+json">
          {"@graph":[{"@type":"Article","headline":"LD headline",
           "description":"LD description","image":{"url":"/ld.png"},
           "author":[{"name":"Ada"}],"datePublished":"2024-01-01"}]}
        </script>
      </head></html>`,
            BASE
        );

        expect(result.title).toBe('LD headline');
        expect(result.description).toBe('LD description');
        expect(result.image).toBe('https://example.com/ld.png');
        expect(result.author).toBe('Ada');
        expect(result.publishedAt).toBe('2024-01-01');
    });

    it('resolves relative images, canonicals and icons against the final URL', () => {
        const result = extractMetadata(
            `<html><head>
        <meta property="og:image" content="../images/hero.png">
        <link rel="canonical" href="/canonical">
        <link rel="icon" href="favicon-32.png">
      </head></html>`,
            BASE
        );

        expect(result.image).toBe('https://example.com/images/hero.png');
        expect(result.canonicalUrl).toBe('https://example.com/canonical');
        expect(result.favicon).toBe('https://example.com/articles/favicon-32.png');
    });

    it('defaults the favicon to /favicon.ico when the page declares none', () => {
        expect(extractMetadata('<html></html>', BASE).favicon).toBe(
            'https://example.com/favicon.ico'
        );
    });

    it('drops javascript: and data: image URLs instead of passing them to the client', () => {
        const scripted = extractMetadata(
            '<html><head><meta property="og:image" content="javascript:alert(1)"></head></html>',
            BASE
        );
        expect(scripted.image).toBe('');

        const data = extractMetadata(
            '<html><head><meta property="og:image" content="data:text/html;base64,PHNjcmlwdD4="></head></html>',
            BASE
        );
        expect(data.image).toBe('');
    });

    it('collapses whitespace in titles', () => {
        const result = extractMetadata(
            '<html><head><title>  Spaced \n\t title  </title></head></html>',
            BASE
        );
        expect(result.title).toBe('Spaced title');
    });

    it('splits keywords and caps the list', () => {
        const result = extractMetadata(
            '<html><head><meta name="keywords" content="a, b ,  c ,,"></head></html>',
            BASE
        );
        expect(result.keywords).toEqual(['a', 'b', 'c']);
    });

    it('falls back to the hostname for the site name', () => {
        expect(extractMetadata('<html></html>', 'https://www.example.com/x').siteName).toBe(
            'example.com'
        );
    });

    it('truncates very long descriptions', () => {
        const result = extractMetadata(
            `<html><head><meta name="description" content="${'x'.repeat(2000)}"></head></html>`,
            BASE
        );
        expect(result.description).toHaveLength(1000);
        expect(result.description.endsWith('…')).toBe(true);
    });

    it('never throws on empty or broken markup', () => {
        expect(() => extractMetadata('', BASE)).not.toThrow();
        expect(() => extractMetadata('<html><head><meta', BASE)).not.toThrow();
    });
});
