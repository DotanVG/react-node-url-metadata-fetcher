// Runs with ALLOW_PRIVATE_ADDRESSES unset, i.e. the production posture.
import { ERROR_CODES } from '../src/errors.js';
import {
    assertPublicUrl,
    isAlwaysBlockedAddress,
    isPrivateAddress,
    parseUrl,
} from '../src/urlSafety.js';

describe('isPrivateAddress', () => {
    it.each([
        '127.0.0.1',
        '127.1.2.3',
        '10.0.0.7',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.169.254', // cloud instance metadata
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '255.255.255.255',
        '::1',
        '::',
        'fd00::1',
        'fe80::1',
        'ff02::1',
        '::ffff:127.0.0.1', // IPv4-mapped loopback
        '64:ff9b::10.0.0.1', // NAT64-wrapped private IPv4
    ])('blocks %s', (ip) => {
        expect(isPrivateAddress(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])(
        'allows %s',
        (ip) => {
            expect(isPrivateAddress(ip)).toBe(false);
        }
    );

    it('refuses anything that is not an IP at all', () => {
        expect(isPrivateAddress('not-an-ip')).toBe(true);
    });
});

describe('parseUrl', () => {
    it('accepts http and https', () => {
        expect(parseUrl('https://example.com/page').href).toBe(
            'https://example.com/page'
        );
        expect(parseUrl('  http://example.com  ').href).toBe('http://example.com/');
    });

    it('strips the fragment', () => {
        expect(parseUrl('https://example.com/a#section').href).toBe(
            'https://example.com/a'
        );
    });

    it.each(['', '   ', 'not a url', 'example.com'])(
        'rejects %p as invalid',
        (input) => {
            expect(() => parseUrl(input)).toThrow(
                expect.objectContaining({ code: ERROR_CODES.INVALID_URL })
            );
        }
    );

    it.each(['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)'])(
        'rejects the protocol in %p',
        (input) => {
            expect(() => parseUrl(input)).toThrow(
                expect.objectContaining({
                    code: ERROR_CODES.UNSUPPORTED_PROTOCOL,
                })
            );
        }
    );

    it('explains the problem in a message a user can act on', () => {
        expect(() => parseUrl('ftp://example.com')).toThrow(
            /Only http:\/\/ and https:\/\/ addresses are supported/
        );
    });
});

describe('assertPublicUrl', () => {
    it.each([
        'http://localhost:3000',
        'http://app.localhost',
        'http://127.0.0.1:8080',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]:9000',
        'http://192.168.0.10',
    ])('blocks %s', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_HOST })
        );
    });

    it('allows a public IP literal', async () => {
        await expect(assertPublicUrl(parseUrl('http://1.1.1.1'))).resolves.toBeUndefined();
    });

    it('reports unresolvable domains as a DNS error', async () => {
        await expect(
            assertPublicUrl(parseUrl('https://this-domain-does-not-exist.invalid'))
        ).rejects.toThrow(expect.objectContaining({ code: ERROR_CODES.DNS_ERROR }));
    });
});

describe('isAlwaysBlockedAddress', () => {
    it.each(['169.254.169.254', '169.254.0.1', '224.0.0.1', '255.255.255.255', '0.0.0.0', 'fe80::1', 'ff02::1', '::ffff:169.254.169.254'])(
        'blocks %s regardless of configuration',
        (ip) => {
            expect(isAlwaysBlockedAddress(ip)).toBe(true);
        }
    );

    it.each(['127.0.0.1', '10.0.0.1', '192.168.1.1', '8.8.8.8'])(
        'leaves %s to the configurable guard',
        (ip) => {
            expect(isAlwaysBlockedAddress(ip)).toBe(false);
        }
    );
});
