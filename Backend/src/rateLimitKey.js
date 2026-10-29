import { BlockList, isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

import { CLOUDFLARE_IP_RANGES, RATE_LIMIT_PROXY_DIAGNOSTICS, TRUST_PROXY_HOPS } from './config.js';

// Cloudflare's published origin-facing networks, checked 2026-10-29:
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
export const DEFAULT_CLOUDFLARE_IP_RANGES = Object.freeze([
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
]);

// Reject lists, ports, brackets and scoped IPv6; accept only one bare IP.
const isSingleIp = (value) => typeof value === 'string' && !value.includes('%') && isIP(value) !== 0;

const cloudflareRanges = new BlockList();
const ranges = CLOUDFLARE_IP_RANGES === undefined
    ? DEFAULT_CLOUDFLARE_IP_RANGES
    : CLOUDFLARE_IP_RANGES.split(',').map((entry) => entry.trim());
for (const range of ranges) {
    const [address, prefix, extra] = range.split('/');
    const family = isSingleIp(address) ? isIP(address) : 0;
    if (!family || extra !== undefined || !/^(0|[1-9]\d*)$/.test(prefix ?? '') ||
        Number(prefix) > (family === 4 ? 32 : 128)) {
        // Do not echo configuration values into startup logs.
        throw new Error('CLOUDFLARE_IP_RANGES must be a nonempty comma-separated list of IPv4/IPv6 CIDRs.');
    }
    cloudflareRanges.addSubnet(address, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
}

export function cloudflareChainStatus(req) {
    const xff = req.get('X-Forwarded-For');
    const entries = xff === undefined ? [] : xff.split(',').map((entry) => entry.trim());
    const peer = req.socket.remoteAddress;
    // Hop 0 is the socket. For N > 0, use ONLY entry N from the right, which
    // must have been observed/appended by the trusted ingress (e.g. Render).
    // Never scan leftwards for a convenient Cloudflare-looking address.
    const boundary = TRUST_PROXY_HOPS === 0 ? peer : entries.at(-TRUST_PROXY_HOPS);
    const completeChain = isSingleIp(peer) && (TRUST_PROXY_HOPS === 0 ||
        (entries.length >= TRUST_PROXY_HOPS && entries.slice(-TRUST_PROXY_HOPS).every(isSingleIp)));
    const cloudflareMatched = Boolean(completeChain && isSingleIp(boundary) &&
        cloudflareRanges.check(boundary, isIP(boundary) === 4 ? 'ipv4' : 'ipv6'));
    return { xffEntries: entries.length, cloudflareMatched };
}

export function rateLimitKey(req) {
    const status = cloudflareChainStatus(req);
    const client = req.get('CF-Connecting-IP');
    if (RATE_LIMIT_PROXY_DIAGNOSTICS) {
        console.info('rate-limit-proxy', status);
    }
    const ip = status.cloudflareMatched && isSingleIp(client) ? client : req.ip;
    // A custom keyGenerator must apply IPv6 grouping itself; ipv6Subnet is
    // ignored by express-rate-limit v8 with a custom key. This also unwraps
    // both dotted and hexadecimal IPv4-mapped IPv6 to the same IPv4 key.
    return ipKeyGenerator(ip, 56);
}
