import dns from 'node:dns/promises';
import net from 'node:net';

import { ALLOW_PRIVATE_ADDRESSES } from './config.js';
import { ERROR_CODES, MetadataError } from './errors.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const IPV4_BLOCKED_RANGES = [
    ['0.0.0.0', 8], // "this" network
    ['10.0.0.0', 8], // RFC1918 private
    ['100.64.0.0', 10], // carrier-grade NAT
    ['127.0.0.0', 8], // loopback
    ['169.254.0.0', 16], // link-local, incl. cloud metadata at 169.254.169.254
    ['172.16.0.0', 12], // RFC1918 private
    ['192.0.0.0', 24], // IETF protocol assignments
    ['192.0.2.0', 24], // TEST-NET-1
    ['192.88.99.0', 24], // 6to4 relay anycast
    ['192.168.0.0', 16], // RFC1918 private
    ['198.18.0.0', 15], // benchmarking
    ['198.51.100.0', 24], // TEST-NET-2
    ['203.0.113.0', 24], // TEST-NET-3
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved + broadcast
];

const ipv4ToInt = (ip) =>
    ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;

function isBlockedIpv4(ip) {
    const value = ipv4ToInt(ip);
    return IPV4_BLOCKED_RANGES.some(([range, bits]) => {
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (value & mask) === (ipv4ToInt(range) & mask);
    });
}

function isBlockedIpv6(ip) {
    const normalized = ip.toLowerCase().split('%')[0]; // strip zone index

    // IPv4-mapped (::ffff:1.2.3.4) and NAT64 (64:ff9b::1.2.3.4) addresses are
    // really IPv4 in a trench coat — unwrap and judge them as such.
    const embedded = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (embedded && net.isIPv4(embedded[1])) {
        return isBlockedIpv4(embedded[1]);
    }

    if (normalized === '::' || normalized === '::1') return true; // unspecified / loopback
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(normalized)) return true; // ff00::/8 multicast
    if (normalized.startsWith('2001:db8:')) return true; // documentation

    return false;
}

// Ranges that stay blocked even when ALLOW_PRIVATE_ADDRESSES is on. Cloud
// instance metadata lives at 169.254.169.254, and no local-development story
// justifies reaching it, so the escape hatch never opens these.
const ALWAYS_BLOCKED_IPV4 = [
    ['0.0.0.0', 8],
    ['169.254.0.0', 16], // link-local, incl. instance metadata
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved + broadcast
];

/** True when an IP literal points somewhere a public web page never should. */
export function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) return isBlockedIpv4(ip);
    if (net.isIPv6(ip)) return isBlockedIpv6(ip);
    return true; // not a recognisable IP: refuse rather than guess
}

/** Subset of isPrivateAddress that no configuration flag can unblock. */
export function isAlwaysBlockedAddress(ip) {
    const target = net.isIPv6(ip)
        ? ip.toLowerCase().split('%')[0].match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1] ?? ip
        : ip;

    if (net.isIPv4(target)) {
        const value = ipv4ToInt(target);
        return ALWAYS_BLOCKED_IPV4.some(([range, bits]) => {
            const mask = (0xffffffff << (32 - bits)) >>> 0;
            return (value & mask) === (ipv4ToInt(range) & mask);
        });
    }

    if (net.isIPv6(target)) {
        const normalized = target.toLowerCase();
        return (
            /^fe[89ab][0-9a-f]:/.test(normalized) || // link-local
            /^ff[0-9a-f]{2}:/.test(normalized) // multicast
        );
    }

    return true;
}

/**
 * Parses and normalises a user-supplied URL.
 * Throws a MetadataError with a friendly message when the input is unusable.
 */
export function parseUrl(input) {
    if (typeof input !== 'string' || !input.trim()) {
        throw new MetadataError(
            ERROR_CODES.INVALID_URL,
            'This entry is empty. Enter a web address such as https://example.com.'
        );
    }

    const candidate = input.trim();
    let url;
    try {
        url = new URL(candidate);
    } catch {
        throw new MetadataError(
            ERROR_CODES.INVALID_URL,
            `"${truncate(candidate)}" is not a valid web address. Try something like https://example.com.`
        );
    }

    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
        throw new MetadataError(
            ERROR_CODES.UNSUPPORTED_PROTOCOL,
            `Only http:// and https:// addresses are supported, but this one uses "${url.protocol.replace(':', '')}".`
        );
    }

    if (!url.hostname) {
        throw new MetadataError(
            ERROR_CODES.INVALID_URL,
            'This address has no host name, so there is nothing to fetch.'
        );
    }

    url.hash = ''; // fragments never reach the server anyway
    return url;
}

/**
 * Blocks requests that would make the server reach into the network it lives
 * on (SSRF). Resolves the host name first, so a public domain pointing at
 * 127.0.0.1 is rejected too.
 */
export async function assertPublicUrl(url) {
    const hostname = url.hostname.replace(/^\[|\]$/g, ''); // unwrap [::1]
    const isBanned = (ip) =>
        isAlwaysBlockedAddress(ip) ||
        (!ALLOW_PRIVATE_ADDRESSES && isPrivateAddress(ip));

    if (net.isIP(hostname)) {
        if (isBanned(hostname)) throw blockedHostError(url.hostname);
        return;
    }

    if (
        !ALLOW_PRIVATE_ADDRESSES &&
        (hostname === 'localhost' || hostname.endsWith('.localhost'))
    ) {
        throw blockedHostError(url.hostname);
    }

    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch {
        throw new MetadataError(
            ERROR_CODES.DNS_ERROR,
            `We could not resolve the domain "${url.hostname}". Check the spelling of the address.`
        );
    }

    if (!addresses.length || addresses.some(({ address }) => isBanned(address))) {
        throw blockedHostError(url.hostname);
    }
}

function blockedHostError(hostname) {
    return new MetadataError(
        ERROR_CODES.BLOCKED_HOST,
        `"${hostname}" points to a private or internal address, which this service will not fetch.`
    );
}

function truncate(value, max = 80) {
    return value.length > max ? `${value.slice(0, max)}…` : value;
}
