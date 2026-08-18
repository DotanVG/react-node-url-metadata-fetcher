/**
 * Regenerates the screenshots used in the README.
 *
 * Start both servers first (Backend: `npm start`, Frontend: `npm run dev`),
 * then from the repo root:
 *
 *   npx playwright install chromium
 *   node docs/capture-screenshots.mjs
 *
 * Pass a different app URL as the first argument if you are not on :5173.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright';

const APP_URL = process.argv[2] ?? 'http://localhost:5173';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');

const SAMPLE_URLS = [
    'https://dotanv.vercel.app',
    'https://orbital-breach.vercel.app',
    'https://count-dawn.vercel.app',
    'https://beat-em-pie.vercel.app',
    'https://dotanv.itch.io',
].join(', ');

const browser = await chromium.launch();

async function capture(name, { dark }) {
    const page = await browser.newPage({
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: dark ? 'dark' : 'light',
    });

    await page.addInitScript((isDark) => {
        localStorage.setItem('umf:theme', isDark ? 'dark' : 'light');
        localStorage.removeItem('umf:urls');
    }, dark);

    await page.goto(APP_URL, { waitUntil: 'networkidle' });

    await page.getByLabel(/web address/i).fill(SAMPLE_URLS);
    await page.getByRole('button', { name: /^add$/i }).click();
    await page.getByRole('button', { name: /fetch metadata/i }).click();
    await page.waitForSelector('#results-heading', { timeout: 90_000 });

    // Let the toasts expire so the shot shows the app, not notifications.
    await page.waitForTimeout(4500);

    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('wrote', file);
    await page.close();
}

await capture('results-light', { dark: false });
await capture('results-dark', { dark: true });

await browser.close();
