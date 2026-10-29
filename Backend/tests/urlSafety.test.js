// Runs with ALLOW_PRIVATE_ADDRESSES unset, i.e. the production posture.
import dns from 'node:dns/promises';
import { jest } from '@jest/globals';
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
    let lookup;

    beforeEach(() => {
        lookup = jest.spyOn(dns, 'lookup').mockResolvedValue([]);
    });

    afterEach(() => {
        lookup.mockRestore();
    });

    it.each([
        'http://localhost',
        'http://app.localhost',
        'http://127.0.0.1',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]',
        'http://192.168.0.10',
    ])('blocks %s', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_HOST })
        );
    });

    // These literals only show their embedded IPv4 after URL normalisation
    // (for example [::ffff:169.254.169.254] becomes [::ffff:a9fe:a9fe]), so
    // they have to be judged through parseUrl, not a dotted-decimal helper.
    it.each([
        'http://[::ffff:a9fe:a9fe]/', // IPv4-mapped 169.254.169.254
        'http://[::ffff:169.254.169.254]/',
        'http://[::ffff:7f00:1]/', // IPv4-mapped 127.0.0.1
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:0:a9fe:a9fe]/', // SIIT IPv4-translated metadata
        'http://[64:ff9b::a9fe:a9fe]/', // NAT64 well-known prefix
        'http://[64:ff9b::169.254.169.254]/',
        'http://[64:ff9b:1::7f00:1]/', // NAT64 local-use prefix, loopback
        'http://[::a9fe:a9fe]/', // IPv4-compatible metadata
        'http://[::7f00:1]/', // IPv4-compatible loopback
        'http://[::10.0.0.1]/',
        'http://[2002:a9fe:a9fe::]/', // 6to4 embedding metadata
        'http://[2002:7f00:1::]/', // 6to4 embedding loopback
        'http://[fc00::1]/',
        'http://[fd00::1]/',
        'http://[fe80::1]/',
        'http://[ff00::1]/',
        'http://[::]/',
    ])('blocks embedded or private literal %s', async (input) => {
        const lookupCalls = lookup.mock.calls.length;
        await expect(assertPublicUrl(parseUrl(input))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_HOST })
        );
        expect(lookup).toHaveBeenCalledTimes(lookupCalls);
    });

    it.each([
        'http://[::ffff:808:808]/', // IPv4-mapped 8.8.8.8
        'http://[64:ff9b::808:808]/', // NAT64 embedding a public IPv4
        'http://[2002:808:808::]/', // 6to4 embedding a public IPv4
        'http://[2606:4700:4700::1111]/',
    ])('allows public literal %s', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).resolves.toBeUndefined();
        expect(lookup).not.toHaveBeenCalled();
    });

    it.each([
        'http://2130706433/', // decimal 127.0.0.1
        'http://3232235777/', // decimal 192.168.1.1
        'http://2852039166/', // decimal 169.254.169.254
        'http://0x7f000001/', // hex 127.0.0.1
        'http://0x7f.0x0.0x0.0x1/',
        'http://0xa9fea9fe/', // hex metadata
        'http://0xC0A80001/', // hex 192.168.0.1
        'http://0177.0.0.1/', // octal loopback
        'http://0300.0250.0.1/', // octal 192.168.0.1
        'http://0251.0376.0251.0376/', // octal metadata
    ])('blocks obfuscated IPv4 literal %s before DNS', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_HOST })
        );
        expect(lookup).not.toHaveBeenCalled();
    });

    it.each([
        'http://192.31.196.1/',
        'http://192.52.193.1/',
        'http://192.175.48.1/',
        'http://[2001::1]/', // Teredo
        'http://[100::1]/', // discard-only
        'http://[2001:10::1]/', // ORCHID
        'http://[2001:20::1]/', // ORCHIDv2
        'http://[fec0::1]/', // site-local
    ])('blocks special-use address %s', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_HOST })
        );
        expect(lookup).not.toHaveBeenCalled();
    });

    it.each([
        'http://example.com:8080/',
        'https://example.com:8443/',
        'http://1.1.1.1:22/',
        'https://[2606:4700:4700::1111]:444/',
        'http://example.com:4433/path',
    ])('rejects %s before any DNS lookup', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_PORT })
        );
        expect(lookup).not.toHaveBeenCalled();
    });

    it.each([
        'http://1.1.1.1/',
        'http://1.1.1.1:80/',
        'https://1.1.1.1/',
        'https://1.1.1.1:443/',
        'http://1.1.1.1:443/',
        'https://1.1.1.1:80/',
    ])('allows web port on %s', async (input) => {
        await expect(assertPublicUrl(parseUrl(input))).resolves.toBeUndefined();
    });

    it('allows a public IP literal', async () => {
        await expect(assertPublicUrl(parseUrl('http://1.1.1.1'))).resolves.toBeUndefined();
        expect(lookup).not.toHaveBeenCalled();
    });

    it('allows a domain only when every resolved address is public', async () => {
        lookup.mockResolvedValue([
            { address: '1.1.1.1', family: 4 },
            { address: '2606:4700:4700::1111', family: 6 },
        ]);

        await expect(assertPublicUrl(parseUrl('https://example.com'))).resolves.toBeUndefined();
        expect(lookup).toHaveBeenCalledWith('example.com', { all: true });
    });

    it.each([
        { name: 'empty', addresses: [] },
        { name: 'private IPv4', addresses: [{ address: '127.0.0.1', family: 4 }] },
        { name: 'mixed public/private IPv4', addresses: [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }] },
        { name: 'mixed public IPv4/private IPv6', addresses: [{ address: '1.1.1.1', family: 4 }, { address: '::1', family: 6 }] },
        { name: 'IPv4-mapped metadata', addresses: [{ address: '::ffff:a9fe:a9fe', family: 6 }] },
        { name: 'NAT64 metadata', addresses: [{ address: '64:ff9b::a9fe:a9fe', family: 6 }] },
        { name: '6to4 loopback', addresses: [{ address: '2002:7f00:1::', family: 6 }] },
    ])('blocks $name DNS answers', async ({ addresses }) => {
        lookup.mockResolvedValue(addresses);

        await expect(assertPublicUrl(parseUrl('https://example.com'))).rejects.toThrow(
            expect.objectContaining({ code: ERROR_CODES.BLOCKED_HOST })
        );
    });

    it('reports unresolvable domains as a DNS error', async () => {
        lookup.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));

        await expect(
            assertPublicUrl(parseUrl('https://this-domain-does-not-exist.invalid'))
        ).rejects.toThrow(expect.objectContaining({ code: ERROR_CODES.DNS_ERROR }));
    });
});

describe('isAlwaysBlockedAddress', () => {
    it.each([
        '169.254.169.254',
        '169.254.0.1',
        '224.0.0.1',
        '255.255.255.255',
        '0.0.0.0',
        'fe80::1',
        'ff02::1',
        '::ffff:169.254.169.254',
        '::ffff:a9fe:a9fe',
        '64:ff9b::a9fe:a9fe',
        '::a9fe:a9fe',
        '2002:a9fe:a9fe::',
        '::ffff:0:a9fe:a9fe',
    ])('blocks %s regardless of configuration', (ip) => {
        expect(isAlwaysBlockedAddress(ip)).toBe(true);
    });

    it.each(['127.0.0.1', '10.0.0.1', '192.168.1.1', '8.8.8.8'])(
        'leaves %s to the configurable guard',
        (ip) => {
            expect(isAlwaysBlockedAddress(ip)).toBe(false);
        }
    );
});
