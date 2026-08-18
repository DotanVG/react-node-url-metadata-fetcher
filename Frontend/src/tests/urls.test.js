import { describe, expect, it } from 'vitest';

import { hostnameOf, isValidUrl, normalizeUrl, parseUrlList, prettyUrl } from '../lib/urls.js';

describe('normalizeUrl', () => {
    it('adds https:// when the user omits the scheme', () => {
        expect(normalizeUrl('example.com')).toBe('https://example.com/');
        expect(normalizeUrl('www.example.com/path')).toBe('https://www.example.com/path');
    });

    it('keeps an explicit scheme', () => {
        expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
        expect(normalizeUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c');
    });

    it('trims whitespace and angle brackets from pasted links', () => {
        expect(normalizeUrl('  <https://example.com>  ')).toBe('https://example.com/');
    });

    it('strips the fragment', () => {
        expect(normalizeUrl('https://example.com/docs#intro')).toBe(
            'https://example.com/docs'
        );
    });

    it.each(['', '   ', 'not a url', 'hello', 'ftp://example.com', 'javascript:alert(1)'])(
        'rejects %p',
        (input) => {
            expect(normalizeUrl(input)).toBeNull();
        }
    );

    it('rejects a bare word rather than turning it into https://word/', () => {
        expect(normalizeUrl('banana')).toBeNull();
        expect(isValidUrl('banana')).toBe(false);
    });

    it('handles non-string input without throwing', () => {
        expect(normalizeUrl(null)).toBeNull();
        expect(normalizeUrl(42)).toBeNull();
    });
});

describe('parseUrlList', () => {
    it('splits on newlines, commas, semicolons and spaces', () => {
        const { valid } = parseUrlList(
            'example.com\nhttps://a.dev, b.io; https://c.net d.org'
        );

        expect(valid).toEqual([
            'https://example.com/',
            'https://a.dev/',
            'https://b.io/',
            'https://c.net/',
            'https://d.org/',
        ]);
    });

    it('separates the entries it could not parse', () => {
        const { valid, invalid } = parseUrlList('example.com nonsense ftp://x.com');

        expect(valid).toEqual(['https://example.com/']);
        expect(invalid).toEqual(['nonsense', 'ftp://x.com']);
    });

    it('de-duplicates within a single paste', () => {
        const { valid } = parseUrlList('example.com, https://example.com, example.com/');

        expect(valid).toEqual(['https://example.com/']);
    });

    it('returns empty lists for empty input', () => {
        expect(parseUrlList('')).toEqual({ valid: [], invalid: [] });
        expect(parseUrlList(undefined)).toEqual({ valid: [], invalid: [] });
    });
});

describe('display helpers', () => {
    it('prettyUrl drops the scheme and trailing slash', () => {
        expect(prettyUrl('https://example.com/')).toBe('example.com');
        expect(prettyUrl('http://example.com/docs')).toBe('example.com/docs');
    });

    it('hostnameOf drops the www prefix and survives junk', () => {
        expect(hostnameOf('https://www.example.com/x')).toBe('example.com');
        expect(hostnameOf('not a url')).toBe('');
    });
});
