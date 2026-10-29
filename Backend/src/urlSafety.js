import dns from 'node:dns/promises';
import net, { BlockList } from 'node:net';

import { ALLOW_PRIVATE_ADDRESSES } from './config.js';
import { ERROR_CODES, MetadataError } from './errors.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
// Default ports collapse to '' in the URL parser. Anything else is rejected
// before DNS. ALLOW_PRIVATE_ADDRESSES is the local-dev hatch used by the
// fixture server, which binds an ephemeral port. The hatch requires exactly
// NODE_ENV=development or NODE_ENV=test; unset and all other values fail closed.
const ALLOWED_PORTS = new Set(['', '80', '443']);

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
    ['192.31.196.0', 24], // AS112
    ['192.52.193.0', 24], // AMT
    ['192.175.48.0', 24], // AS112 direct
    ['198.18.0.0', 15], // benchmarking
    ['198.51.100.0', 24], // TEST-NET-2
    ['203.0.113.0', 24], // TEST-NET-3
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved + broadcast
];

// Ranges that stay blocked even when ALLOW_PRIVATE_ADDRESSES is on. Cloud
// instance metadata lives at 169.254.169.254, and no local-development story
// justifies reaching it, so the escape hatch never opens these.
const ALWAYS_BLOCKED_IPV4 = [
    ['0.0.0.0', 8],
    ['169.254.0.0', 16], // link-local, incl. instance metadata
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved + broadcast
];

function subnetList(ranges) {
    const list = new BlockList();
    for (const [address, prefix] of ranges) {
        list.addSubnet(address, prefix, 'ipv4');
    }
    return list;
}

const blockedIpv4 = subnetList(IPV4_BLOCKED_RANGES);
const alwaysBlockedIpv4 = subnetList(ALWAYS_BLOCKED_IPV4);

const blockedIpv6 = new BlockList();
blockedIpv6.addAddress('::', 'ipv6');
blockedIpv6.addAddress('::1', 'ipv6');
blockedIpv6.addSubnet('fc00::', 7, 'ipv6'); // unique local
blockedIpv6.addSubnet('fe80::', 10, 'ipv6'); // link-local
blockedIpv6.addSubnet('ff00::', 8, 'ipv6'); // multicast
blockedIpv6.addSubnet('2001:db8::', 32, 'ipv6'); // documentation
blockedIpv6.addSubnet('64:ff9b:1::', 48, 'ipv6'); // local-use NAT64
blockedIpv6.addSubnet('2001::', 32, 'ipv6'); // Teredo
blockedIpv6.addSubnet('100::', 64, 'ipv6'); // discard-only
blockedIpv6.addSubnet('2001:10::', 28, 'ipv6'); // ORCHID
blockedIpv6.addSubnet('2001:20::', 28, 'ipv6'); // ORCHIDv2
blockedIpv6.addSubnet('fec0::', 10, 'ipv6'); // deprecated site-local

const alwaysBlockedIpv6 = new BlockList();
alwaysBlockedIpv6.addSubnet('fe80::', 10, 'ipv6');
alwaysBlockedIpv6.addSubnet('ff00::', 8, 'ipv6');

function bareIp(ip) {
    if (typeof ip !== 'string') return '';
    return ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
}

/** Expands an IPv6 literal, including a dotted IPv4 tail, to 16 bytes. */
function ipv6Bytes(ip) {
    if (!net.isIPv6(ip)) return null;

    let text = ip;
    const dotted = text.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (dotted && net.isIPv4(dotted[2])) {
        const octets = dotted[2].split('.').map((part) => Number(part));
        if (octets.some((octet) => octet > 255)) return null;
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        text = `${dotted[1]}${high}:${low}`;
    }

    const halves = text.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    if (halves.length === 1 && head.length !== 8) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;

    const groups = [...head, ...Array.from({ length: missing }, () => '0'), ...tail];
    if (groups.length !== 8) return null;

    const bytes = Buffer.alloc(16);
    for (let index = 0; index < 8; index += 1) {
        if (!/^[0-9a-f]{1,4}$/.test(groups[index])) return null;
        const value = Number.parseInt(groups[index], 16);
        bytes[index * 2] = value >> 8;
        bytes[index * 2 + 1] = value & 0xff;
    }
    return bytes;
}

function ipv4At(bytes, offset) {
    return `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`;
}

function isZero(bytes, from, to) {
    for (let index = from; index < to; index += 1) {
        if (bytes[index] !== 0) return false;
    }
    return true;
}

/**
 * IPv4 carried inside an IPv6 literal. URL parsing rewrites dotted tails to
 * hex (`::ffff:169.254.169.254` becomes `::ffff:a9fe:a9fe`), so the embedded
 * address has to be recovered from the bytes. `::` and `::1` stay unspecified
 * and loopback; they are not 0.0.0.0 and 0.0.0.1.
 */
function embeddedIpv4(ip) {
    const bytes = ipv6Bytes(ip);
    if (!bytes) return null;

    // IPv4-mapped ::ffff:0:0/96.
    if (isZero(bytes, 0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
        return ipv4At(bytes, 12);
    }

    // SIIT IPv4-translated ::ffff:0:0:0/96.
    if (
        isZero(bytes, 0, 8) &&
        bytes[8] === 0xff &&
        bytes[9] === 0xff &&
        isZero(bytes, 10, 12)
    ) {
        return ipv4At(bytes, 12);
    }

    // NAT64 well-known prefix 64:ff9b::/96. The IPv4 is the last 32 bits.
    if (
        bytes[0] === 0x00 &&
        bytes[1] === 0x64 &&
        bytes[2] === 0xff &&
        bytes[3] === 0x9b &&
        isZero(bytes, 4, 12)
    ) {
        return ipv4At(bytes, 12);
    }

    // NAT64 local-use prefix 64:ff9b:1::/48 (RFC 6052 /48 layout).
    if (
        bytes[0] === 0x00 &&
        bytes[1] === 0x64 &&
        bytes[2] === 0xff &&
        bytes[3] === 0x9b &&
        bytes[4] === 0x00 &&
        bytes[5] === 0x01
    ) {
        return `${bytes[6]}.${bytes[7]}.${bytes[9]}.${bytes[10]}`;
    }

    // 6to4 2002::/16 embeds IPv4 in bits 16-47.
    if (bytes[0] === 0x20 && bytes[1] === 0x02) {
        return ipv4At(bytes, 2);
    }

    // Deprecated IPv4-compatible ::/96.
    if (isZero(bytes, 0, 12)) {
        const embedded = ipv4At(bytes, 12);
        if (embedded === '0.0.0.0' || embedded === '0.0.0.1') return null;
        return embedded;
    }

    return null;
}

function listed(list, ip, family) {
    try {
        return list.check(ip, family);
    } catch {
        return true; // unparseable for this family: refuse rather than guess
    }
}

/** True when an IP literal points somewhere a public web page never should. */
export function isPrivateAddress(ip) {
    const bare = bareIp(ip);
    if (net.isIPv4(bare)) return listed(blockedIpv4, bare, 'ipv4');
    if (!net.isIPv6(bare)) return true; // not a recognisable IP: refuse rather than guess
    if (listed(blockedIpv6, bare, 'ipv6')) return true;
    // BlockList folds IPv4-mapped ::ffff:0:0/96 into the IPv4 list. NAT64,
    // 6to4, SIIT and IPv4-compatible addresses are unwrapped and re-checked.
    if (listed(blockedIpv4, bare, 'ipv6')) return true;
    const embedded = embeddedIpv4(bare);
    return embedded ? listed(blockedIpv4, embedded, 'ipv4') : false;
}

/** Subset of isPrivateAddress that no configuration flag can unblock. */
export function isAlwaysBlockedAddress(ip) {
    const bare = bareIp(ip);
    if (net.isIPv4(bare)) return listed(alwaysBlockedIpv4, bare, 'ipv4');
    if (!net.isIPv6(bare)) return true;
    if (listed(alwaysBlockedIpv6, bare, 'ipv6')) return true;
    if (listed(alwaysBlockedIpv4, bare, 'ipv6')) return true;
    const embedded = embeddedIpv4(bare);
    return embedded ? listed(alwaysBlockedIpv4, embedded, 'ipv4') : false;
}

/** Same decision assertPublicUrl and the connect-time lookup both apply. */
export function isBlockedAddress(ip) {
    return (
        isAlwaysBlockedAddress(ip) ||
        (!ALLOW_PRIVATE_ADDRESSES && isPrivateAddress(ip))
    );
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
    if (!ALLOW_PRIVATE_ADDRESSES && !ALLOWED_PORTS.has(url.port)) {
        throw new MetadataError(
            ERROR_CODES.BLOCKED_PORT,
            `Only ports 80 and 443 can be fetched, and this address uses port ${url.port}.`
        );
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').split('%')[0]; // unwrap [::1]

    if (net.isIP(hostname)) {
        if (isBlockedAddress(hostname)) throw blockedHostError(url.hostname);
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

    if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
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
