import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const headers = readFileSync(path.join(root, 'public/_headers'), 'utf8');
const policy = headers
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('Content-Security-Policy:'));

const themeScriptHash = () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    return `sha256-${createHash('sha256').update(match[1]).digest('base64')}`;
};

describe('Netlify security headers', () => {
    it('sends an enforcing Content-Security-Policy', () => {
        expect(headers).not.toMatch(/Content-Security-Policy-Report-Only/);
        expect(policy).toMatch(/^Content-Security-Policy:/);
    });

    it('allows the API, self-hosted fonts, and displayed preview images', () => {
        expect(policy).toContain(
            "connect-src 'self' https://react-node-url-metadata-fetcher.onrender.com"
        );
        expect(policy).toContain("font-src 'self'");
        expect(policy).toContain("img-src 'self' https: data: blob:");
        expect(policy).toContain(themeScriptHash());
        expect(policy).not.toMatch(/google-analytics|googletagmanager|plausible|posthog/i);
    });
});
