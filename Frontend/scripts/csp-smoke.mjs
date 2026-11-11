/**
 * Builds the frontend, serves dist with the Netlify headers, and drives the
 * main flow in headless Chrome: submit a URL, see the result, clear it.
 * Fails if the enforcing Content-Security-Policy reports any violation.
 *
 *   npm run test:csp
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_ORIGIN = 'https://react-node-url-metadata-fetcher.onrender.com';
const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml',
};

const metadata = {
    results: [
        {
            url: 'https://example.com/article',
            finalUrl: 'https://example.com/article',
            ok: true,
            title: 'CSP Smoke Article',
            description: 'A preview loaded under the enforcing policy.',
            siteName: 'Example',
            image: 'https://images.example.test/og.png',
            imageAlt: 'Preview',
            favicon: 'https://images.example.test/favicon.png',
        },
    ],
    summary: { requested: 1, succeeded: 1, failed: 0 },
};

function parseNetlifyHeaders(text) {
    const blocks = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        if (!/^\s/.test(line)) {
            current = { path: line.trim(), headers: {} };
            blocks.push(current);
            continue;
        }
        const raw = line.trim();
        const splitAt = raw.indexOf(':');
        if (!current || splitAt === -1) continue;
        current.headers[raw.slice(0, splitAt).trim()] = raw.slice(splitAt + 1).trim();
    }
    return blocks;
}

function headersFor(blocks, urlPath) {
    const headers = {};
    for (const block of blocks) {
        const pattern = block.path
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        if (new RegExp(`^${pattern}$`).test(urlPath)) {
            Object.assign(headers, block.headers);
        }
    }
    return headers;
}

async function fileExists(file) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

async function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        if (await fileExists(candidate)) return candidate;
    }
    throw new Error('Headless Chrome was not found. Set CHROME_PATH.');
}

function build() {
    return new Promise((resolve, reject) => {
        const child = spawn('npm', ['run', 'build'], {
            cwd: root,
            env: { ...process.env, VITE_API_URL: API_ORIGIN },
            stdio: 'inherit',
        });
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`vite build exited ${code}`));
        });
    });
}

function startStaticServer(blocks) {
    const dist = path.join(root, 'dist');
    const server = createServer(async (req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
        const file = path.normalize(path.join(dist, relative));
        if (!file.startsWith(dist)) {
            res.writeHead(403);
            res.end();
            return;
        }

        let body;
        try {
            body = await readFile(file);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        const ext = path.extname(file);
        res.writeHead(200, {
            ...headersFor(blocks, urlPath),
            'Content-Type': MIME[ext] || 'application/octet-stream',
        });
        res.end(body);
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                origin: `http://127.0.0.1:${port}`,
                close: () => new Promise((done) => server.close(done)),
            });
        });
    });
}

class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = new Set();
        ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) reject(new Error(JSON.stringify(message.error)));
                else resolve(message.result);
                return;
            }
            if (message.method) {
                for (const listener of this.listeners) listener(message);
            }
        });
    }

    send(method, params = {}) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, handler) {
        const listener = (message) => {
            if (message.method === method) handler(message.params);
        };
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

async function connectPage(port) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
        response.json()
    );
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('Chrome did not open a page target.');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
}

async function waitForDevtoolsPort(profile) {
    const file = path.join(profile, 'DevToolsActivePort');
    const started = Date.now();
    for (;;) {
        try {
            const text = await readFile(file, 'utf8');
            const port = Number(text.split('\n')[0]);
            if (port) return port;
        } catch {
            // Chrome is still starting.
        }
        if (Date.now() - started > 10_000) {
            throw new Error('Chrome did not open a DevTools port.');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

function fulfill(cdp, requestId, { status = 200, contentType, body, origin }) {
    const responseHeaders = [
        { name: 'Access-Control-Allow-Origin', value: origin },
        { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
        { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Accept' },
        { name: 'Vary', value: 'Origin' },
    ];
    if (contentType) {
        responseHeaders.unshift({ name: 'Content-Type', value: contentType });
    }
    return cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders,
        body: Buffer.from(body).toString('base64'),
    });
}

async function evaluate(cdp, expression) {
    const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
    }
    return result.result?.value;
}

async function main() {
    const headerText = await readFile(path.join(root, 'public/_headers'), 'utf8');
    if (/Content-Security-Policy-Report-Only/.test(headerText)) {
        throw new Error('CSP is still Report-Only.');
    }
    if (!/^\s*Content-Security-Policy:/m.test(headerText)) {
        throw new Error('No enforcing Content-Security-Policy header.');
    }

    const blocks = parseNetlifyHeaders(headerText);
    await build();
    const site = await startStaticServer(blocks);
    const profile = await mkdtemp(path.join(tmpdir(), 'csp-smoke-'));
    const chromePath = await findChrome();
    const chrome = spawn(
        chromePath,
        [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--remote-debugging-port=0',
            `--user-data-dir=${profile}`,
            'about:blank',
        ],
        { stdio: 'ignore' }
    );

    let cdp;
    try {
        const documentResponse = await fetch(`${site.origin}/`);
        const csp = documentResponse.headers.get('content-security-policy');
        await documentResponse.arrayBuffer();
        if (!csp || documentResponse.headers.get('content-security-policy-report-only')) {
            throw new Error('The preview response is not enforcing Content-Security-Policy.');
        }

        const port = await waitForDevtoolsPort(profile);
        cdp = await connectPage(port);
        const violations = [];

        cdp.on('Fetch.requestPaused', (params) => {
            const url = params.request.url;
            const method = params.request.method;
            const answer = (task) => {
                task.catch((error) => {
                    console.error('Failed to answer', url, error);
                });
            };

            if (url.startsWith(site.origin)) {
                answer(cdp.send('Fetch.continueRequest', { requestId: params.requestId }));
                return;
            }
            if (url.startsWith(API_ORIGIN) && method === 'OPTIONS') {
                answer(fulfill(cdp, params.requestId, { status: 204, body: '', origin: site.origin }));
                return;
            }
            if (url.startsWith(`${API_ORIGIN}/health`)) {
                answer(
                    fulfill(cdp, params.requestId, {
                        contentType: 'application/json',
                        body: JSON.stringify({ status: 'ok' }),
                        origin: site.origin,
                    })
                );
                return;
            }
            if (url.startsWith(`${API_ORIGIN}/fetch-metadata`)) {
                answer(
                    fulfill(cdp, params.requestId, {
                        contentType: 'application/json',
                        body: JSON.stringify(metadata),
                        origin: site.origin,
                    })
                );
                return;
            }
            if (url.startsWith('https://images.example.test/')) {
                answer(
                    fulfill(cdp, params.requestId, {
                        contentType: 'image/png',
                        body: PNG,
                        origin: site.origin,
                    })
                );
                return;
            }
            answer(
                cdp.send('Fetch.failRequest', {
                    requestId: params.requestId,
                    errorReason: 'BlockedByClient',
                })
            );
        });

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Fetch.enable', {
            patterns: [{ urlPattern: '*', requestStage: 'Request' }],
        });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `window.__cspViolations = [];
document.addEventListener('securitypolicyviolation', (event) => {
    window.__cspViolations.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
        sample: event.sample,
        line: event.lineNumber,
    });
});`,
        });

        await cdp.send('Page.navigate', { url: `${site.origin}/` });
        await waitUntil(
            () =>
                evaluate(
                    cdp,
                    `location.origin === ${JSON.stringify(site.origin)} && document.readyState === 'complete'`
                ),
            'The page did not load'
        );

        await waitUntil(
            () => evaluate(cdp, `document.body.innerText.includes('API ready')`),
            'API status never became ready'
        );

        await evaluate(
            cdp,
            `(() => {
                const input = document.querySelector('#url-input');
                const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                set.call(input, 'https://example.com/article');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            })()`
        );
        await evaluate(
            cdp,
            `[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Add').click()`
        );
        await waitUntil(
            () => evaluate(cdp, `document.body.innerText.includes('1 URL queued')`),
            'The URL was not queued'
        );
        await evaluate(
            cdp,
            `[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Fetch metadata')).click()`
        );

        await waitUntil(
            () => evaluate(cdp, `document.body.innerText.includes('CSP Smoke Article')`),
            'The fetched title never appeared'
        );
        const images = await waitUntil(
            async () => {
                const found = await evaluate(
                    cdp,
                    `(() => {
                        const nodes = [...document.querySelectorAll('img')];
                        return nodes.map((img) => ({ src: img.currentSrc || img.src, complete: img.complete, width: img.naturalWidth }));
                    })()`
                );
                const preview = found?.find((img) => img.src.includes('images.example.test/og.png'));
                const favicon = found?.find((img) => img.src.includes('images.example.test/favicon.png'));
                if (preview?.width >= 1 && favicon?.width >= 1) return found;
                return null;
            },
            'Preview image or favicon did not load'
        );
        const preview = images.find((img) => img.src.includes('images.example.test/og.png'));
        const favicon = images.find((img) => img.src.includes('images.example.test/favicon.png'));
        if (!preview?.complete || preview.width < 1) {
            throw new Error(`Preview image did not load: ${JSON.stringify(images)}`);
        }
        if (!favicon?.complete || favicon.width < 1) {
            throw new Error(`Favicon did not load: ${JSON.stringify(images)}`);
        }

        await evaluate(
            cdp,
            `[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Clear all')).click()`
        );
        await waitUntil(
            () =>
                evaluate(
                    cdp,
                    `!document.body.innerText.includes('CSP Smoke Article') && document.body.innerText.includes('Nothing queued yet')`
                ),
            'Clearing the results did not return to the empty state'
        );

        const pageViolations = await evaluate(cdp, `window.__cspViolations`);
        violations.push(...(pageViolations || []));
        if (violations.length > 0) {
            throw new Error(`CSP violations:\n${JSON.stringify(violations, null, 2)}`);
        }

        const enforcing = await evaluate(
            cdp,
            `(() => {
                const header = document.querySelector('meta[http-equiv]')?.content || '';
                return {
                    csp: header,
                    font: document.fonts.check('16px Inter'),
                };
            })()`
        );
        console.log(
            JSON.stringify(
                {
                    ok: true,
                    enforcingHeader: csp.startsWith("default-src 'self'"),
                    fontLoaded: enforcing.font,
                    images: images.map((img) => img.src),
                    violations: 0,
                },
                null,
                2
            )
        );
    } catch (error) {
        try {
            const snapshot = await evaluate(
                cdp,
                `JSON.stringify({ text: document.body?.innerText?.slice(0, 500), violations: window.__cspViolations, href: location.href })`
            );
            console.error('page:', snapshot);
        } catch {
            // The page may not be evaluable yet.
        }
        throw error;
    } finally {
        chrome.kill('SIGKILL');
        await site.close();
        await new Promise((resolve) => setTimeout(resolve, 200));
        await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
}

async function waitUntil(read, message) {
    const started = Date.now();
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() - started > 8_000) throw new Error(message);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
