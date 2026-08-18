import { describe, expect, it } from 'vitest';

import { escapeCsvField, toCsv, toJson } from '../lib/exports.js';

describe('escapeCsvField', () => {
    it('quotes every field', () => {
        expect(escapeCsvField('plain')).toBe('"plain"');
    });

    it('doubles embedded quotes instead of breaking the row', () => {
        expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    });

    it('keeps commas and newlines inside the quoted field', () => {
        expect(escapeCsvField('a,b')).toBe('"a,b"');
        expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('neutralises spreadsheet formula injection', () => {
        expect(escapeCsvField('=HYPERLINK("http://evil","click")')).toBe(
            '"\'=HYPERLINK(""http://evil"",""click"")"'
        );
        expect(escapeCsvField('+1')).toBe('"\'+1"');
        expect(escapeCsvField('-2')).toBe('"\'-2"');
        expect(escapeCsvField('@cmd')).toBe('"\'@cmd"');
    });

    it('renders null and undefined as empty fields', () => {
        expect(escapeCsvField(null)).toBe('""');
        expect(escapeCsvField(undefined)).toBe('""');
    });
});

describe('toCsv', () => {
    const results = [
        {
            url: 'https://a.dev',
            finalUrl: 'https://a.dev/',
            ok: true,
            status: 200,
            title: 'Title, with comma',
            description: 'Says "hello"',
        },
        {
            url: 'https://b.dev',
            ok: false,
            error: { code: 'HTTP_ERROR', message: 'Not found (404).' },
        },
    ];

    it('writes a header row followed by one row per result', () => {
        const rows = toCsv(results).split('\r\n');

        expect(rows).toHaveLength(3);
        expect(rows[0]).toContain('"URL"');
        expect(rows[0]).toContain('"Title"');
    });

    it('keeps a comma inside a title from splitting the row', () => {
        const [, firstRow] = toCsv(results).split('\r\n');

        expect(firstRow).toContain('"Title, with comma"');
        expect(firstRow).toContain('"Says ""hello"""');
    });

    it('puts the error message in the error column for failed results', () => {
        const [, , secondRow] = toCsv(results).split('\r\n');

        expect(secondRow).toContain('"Not found (404)."');
    });

    it('handles an empty result set', () => {
        expect(toCsv([]).split('\r\n')).toHaveLength(1);
    });
});

describe('toJson', () => {
    it('pretty-prints the results', () => {
        expect(toJson([{ url: 'https://a.dev' }])).toBe(
            '[\n  {\n    "url": "https://a.dev"\n  }\n]'
        );
    });
});
