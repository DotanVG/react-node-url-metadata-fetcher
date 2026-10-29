// config.js reads NODE_ENV when it is first imported. A child process is the
// only way to observe each environment without poisoning the suite.
import { spawnSync } from 'node:child_process';

const script = (enabled) => `
import assert from 'node:assert/strict';
const { ALLOW_PRIVATE_ADDRESSES } = await import('./src/config.js');
const { assertPublicUrl, isBlockedAddress, parseUrl } = await import('./src/urlSafety.js');
const { ERROR_CODES } = await import('./src/errors.js');

assert.equal(ALLOW_PRIVATE_ADDRESSES, ${enabled});

const privateUrls = [
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[fc00::1]/',
];

for (const input of privateUrls) {
    const url = parseUrl(input);
    assert.equal(isBlockedAddress(url.hostname.replace(/^\\[|\\]$/g, '')), ${!enabled});
    if (${enabled}) {
        await assertPublicUrl(parseUrl(input));
    } else {
        await assert.rejects(assertPublicUrl(url), { code: ERROR_CODES.BLOCKED_HOST });
    }
}

if (${enabled}) {
    await assertPublicUrl(parseUrl('http://1.1.1.1:8080/'));
} else {
    await assert.rejects(assertPublicUrl(parseUrl('http://1.1.1.1:8080/')), {
        code: ERROR_CODES.BLOCKED_PORT,
    });
}

for (const input of ['http://169.254.169.254/', 'http://[fe80::1]/', 'http://224.0.0.1/']) {
    await assert.rejects(assertPublicUrl(parseUrl(input)), { code: ERROR_CODES.BLOCKED_HOST });
}

await assertPublicUrl(parseUrl('https://1.1.1.1/'));
await assertPublicUrl(parseUrl('http://8.8.8.8/'));
`;

describe('ALLOW_PRIVATE_ADDRESSES environment gate', () => {
    it.each([
        [undefined, 'true', false],
        ['', 'true', false],
        ['production', 'true', false],
        ['Production', 'true', false],
        ['staging', 'true', false],
        ['dev', 'true', false],
        ['Development', 'true', false],
        ['TEST', 'true', false],
        ['development ', 'true', false],
        ['development\n', 'true', false],
        ['test\n', 'true', false],
        ['production\n', 'true', false],
        ['devel\u043epment', 'true', false],
        ['t\u0435st', 'true', false],
        ['development', 'true', true],
        ['test', 'true', true],
        ['development', 'false', false],
        ['test', 'false', false],
        ['development', undefined, false],
        ['test', undefined, false],
        ...['development', 'test'].flatMap((env) => [
            ...['1', 'TRUE', 'TrUe', 'yes', 'YES', 'on', 'ON'].map((flag) => [env, flag, true]),
            ...['', '0', 'FALSE', 'no', 'off', ' true', 'true ', 'true\n', '1\n', 'tru\u0435'].map((flag) => [env, flag, false]),
        ]),
    ])('NODE_ENV=%p, ALLOW_PRIVATE_ADDRESSES=%p enables the hatch: %p', (nodeEnv, hatch, enabled) => {
        const env = { ...process.env };
        delete env.NODE_ENV;
        delete env.ALLOW_PRIVATE_ADDRESSES;
        if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
        if (hatch !== undefined) env.ALLOW_PRIVATE_ADDRESSES = hatch;

        const result = spawnSync(
            process.execPath,
            ['--input-type=module', '--eval', script(enabled)],
            { cwd: process.cwd(), env, encoding: 'utf8', timeout: 10_000 }
        );

        if (result.status !== 0) {
            throw new Error(result.stderr || result.stdout || `exit ${result.status}`);
        }
    });
});
