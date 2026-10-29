// config.js reads NODE_ENV when it is first imported. A child process is the
// only way to observe the production posture without poisoning the suite.
import { spawnSync } from 'node:child_process';

const script = `
process.env.NODE_ENV = 'production';
process.env.ALLOW_PRIVATE_ADDRESSES = 'true';

const { ALLOW_PRIVATE_ADDRESSES, IS_PRODUCTION } = await import('./src/config.js');
const { assertPublicUrl, parseUrl } = await import('./src/urlSafety.js');
const { ERROR_CODES } = await import('./src/errors.js');

if (!IS_PRODUCTION || ALLOW_PRIVATE_ADDRESSES !== false) {
    console.error('hatch was honored in production', { IS_PRODUCTION, ALLOW_PRIVATE_ADDRESSES });
    process.exit(2);
}

const blocked = [
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[fc00::1]/',
];

for (const input of blocked) {
    try {
        await assertPublicUrl(parseUrl(input));
        console.error('allowed private address', input);
        process.exit(3);
    } catch (error) {
        if (error.code !== ERROR_CODES.BLOCKED_HOST) {
            console.error('unexpected code for', input, error.code);
            process.exit(4);
        }
    }
}

try {
    await assertPublicUrl(parseUrl('http://1.1.1.1:8080/'));
    console.error('allowed a non-web port');
    process.exit(5);
} catch (error) {
    if (error.code !== ERROR_CODES.BLOCKED_PORT) {
        console.error('unexpected port code', error.code);
        process.exit(6);
    }
}

await assertPublicUrl(parseUrl('https://1.1.1.1/'));
await assertPublicUrl(parseUrl('http://8.8.8.8/'));
`;

describe('ALLOW_PRIVATE_ADDRESSES in production', () => {
    it('is ignored, so loopback, RFC1918, CGNAT and other ports stay blocked', () => {
        const result = spawnSync(
            process.execPath,
            ['--input-type=module', '--eval', script],
            { cwd: process.cwd(), encoding: 'utf8' }
        );

        if (result.status !== 0) {
            throw new Error(result.stderr || result.stdout || `exit ${result.status}`);
        }
    });
});
