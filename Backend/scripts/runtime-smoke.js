import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

// Exercise the real entry point with production SSRF rules, even when the
// development escape hatch is requested. No private target should be contacted.
const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const { port } = reservation.address();
await new Promise((resolve) => reservation.close(resolve));

const limit = 30;
const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: {
        ...process.env,
        NODE_ENV: 'production',
        ALLOW_PRIVATE_ADDRESSES: 'true',
        PORT: String(port),
        RATE_LIMIT_MAX: String(limit),
        RATE_LIMIT_WINDOW_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (data) => { output += data; });
child.stderr.on('data', (data) => { output += data; });
const exited = once(child, 'exit');
const base = `http://127.0.0.1:${port}`;
let requests = 0;
const post = async (urls) => {
    requests += 1;
    const response = await fetch(`${base}/fetch-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
};

try {
    let health;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
            break;
        } catch {
            if (child.exitCode !== null) throw new Error(output);
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    assert.equal(health?.status, 200, output);
    assert.equal((await health.json()).status, 'ok');
    console.log('PASS GET /health: HTTP 200, status ok');

    const normal = await post(['https://www.iana.org/']);
    assert.equal(normal.status, 200);
    assert.equal(normal.body.results[0].ok, true, JSON.stringify(normal.body));
    assert.equal(normal.body.results[0].title, 'Internet Assigned Numbers Authority');
    console.log('PASS public metadata: https://www.iana.org/ => HTTP 200, Internet Assigned Numbers Authority');

    const blocked = [
        'http://localhost/', 'http://127.0.0.1/', 'http://169.254.169.254/',
        'http://10.0.0.1/', 'http://172.16.0.1/', 'http://192.168.1.1/',
        'http://[::1]/', 'http://[fc00::1]/',
    ];
    const direct = await post(blocked);
    assert.equal(direct.status, 200);
    assert.equal(direct.body.results.length, blocked.length);
    for (const [index, result] of direct.body.results.entries()) {
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'BLOCKED_HOST', JSON.stringify(result));
        console.log(`PASS direct SSRF: ${blocked[index]} => BLOCKED_HOST (per-URL HTTP 200 envelope)`);
    }

    for (const target of blocked) {
        const redirect = `https://httpbin.dev/redirect-to?url=${encodeURIComponent(target)}`;
        const upstream = await fetch(redirect, {
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
        });
        assert.equal(upstream.status, 302);
        assert.equal(upstream.headers.get('location'), target);
        await upstream.body?.cancel();
        const result = await post([redirect]);
        assert.equal(result.status, 200);
        assert.equal(result.body.results[0].ok, false);
        assert.equal(result.body.results[0].error.code, 'BLOCKED_HOST', JSON.stringify(result.body));
        console.log(`PASS public redirect SSRF: ${target} => BLOCKED_HOST`);
    }

    while (requests < limit) assert.equal((await post(['not a url'])).status, 200);
    const limited = await post(['not a url']);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'RATE_LIMITED');
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    console.log(`PASS rate limit: requests 1-${limit} HTTP 200; request ${requests} HTTP 429, RATE_LIMITED, Retry-After present`);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    console.log('PASS health remains HTTP 200 after rate limit');
} finally {
    child.kill();
    await exited;
    console.log('Server child stopped');
}
