/**
 * Reads width and height from PNG, GIF, JPEG or WebP header bytes. Returns
 * nulls for anything else (SVG, AVIF) rather than guessing.
 */
export function imageSize(buf) {
    const none = { width: null, height: null };

    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') {
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
        const chunk = buf.toString('latin1', 12, 16);
        if (chunk === 'VP8 ') {
            return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        }
        if (chunk === 'VP8L') {
            const bits = buf.readUInt32LE(21);
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (chunk === 'VP8X') {
            return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
        }
        return none;
    }
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        // Walk the JPEG segments to the first start-of-frame marker.
        let offset = 2;
        while (offset + 9 < buf.length) {
            if (buf[offset] !== 0xff) return none;
            const marker = buf[offset + 1];
            if (marker === 0xff) {
                offset += 1; // fill byte
                continue;
            }
            const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
            if (isFrame) {
                return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
            }
            offset += 2 + buf.readUInt16BE(offset + 2);
        }
    }
    return none;
}
