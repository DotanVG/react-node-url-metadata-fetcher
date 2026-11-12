import { IMAGE_TIMEOUT_MS, USER_AGENT } from './config.js';
import { imageSize } from './imageSize.js';
import { HEAVY_IMAGE_BYTES } from './metadataModel.js';
import { combineSignal, discardBody, fetchPublic } from './publicFetch.js';

// Header bytes are almost always in the first few KB; a JPEG with a fat EXIF
// block is the exception, so allow a little room before giving up.
const SNIFF_BYTES = 256 * 1024;

/**
 * Fetches the preview image the way a social crawler would and reports what it
 * actually got. Never throws: a broken image is a finding, not a failure.
 */
export async function checkImage(imageUrl, { signal } = {}) {
    if (!imageUrl) return null;

    let response;
    try {
        ({ response } = await fetchPublic(imageUrl, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
            signal: combineSignal(signal, IMAGE_TIMEOUT_MS),
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
