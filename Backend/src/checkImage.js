import { IMAGE_TIMEOUT_MS, USER_AGENT } from './config.js';
import { discardBody, fetchPublic } from './fetchPage.js';

// Past this, previews load slowly and some platforms drop the image.
export const HEAVY_IMAGE_BYTES = 1024 * 1024;
// Header bytes are almost always in the first few KB; a JPEG with a fat EXIF
// block is the exception, so allow a little room before giving up.
const SNIFF_BYTES = 256 * 1024;

/**
 * Fetches the preview image the way a social crawler would and reports what it
 * actually got. Never throws: a broken image is a finding, not a failure.
 */
export async function checkImage(imageUrl) {
    if (!imageUrl) return null;

    let response;
    try {
        ({ response } = await fetchPublic(imageUrl, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
            signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        }));
    } catch (error) {
        return { url: imageUrl, ok: false, error: error.message };
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
    const declared = Number(response.headers.get('content-length'));
    const result = {
        url: imageUrl,
        ok: response.ok && contentType.startsWith('image/'),
        status: response.status,
        contentType,
        bytes: Number.isFinite(declared) && declared > 0 ? declared : null,
        width: null,
        height: null,
    };

    if (!result.ok || !response.body) {
        await discardBody(response);
        return result;
    }

    // Read just enough to find the dimensions, and, when the server did not
    // say how big the file is, just enough to know whether it is too heavy.
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                result.bytes ??= total;
                break;
            }
            chunks.push(value);
            total += value.byteLength;

            if (result.width === null && total - value.byteLength < SNIFF_BYTES) {
                Object.assign(result, imageSize(Buffer.concat(chunks)));
            }
            const sniffed = result.width !== null || total > SNIFF_BYTES;
            if (sniffed && (result.bytes !== null || total > HEAVY_IMAGE_BYTES)) break;
        }
    } catch {
        // Timed out or the socket dropped mid-body; report what we have.
    }
    await reader.cancel().catch(() => {});

    if (result.bytes === null && total > HEAVY_IMAGE_BYTES) result.bytes = total;
    return result;
}

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
