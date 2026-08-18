import { auditMetadata } from './auditMetadata.js';
import { FETCH_CONCURRENCY } from './config.js';
import { toMetadataError } from './errors.js';
import { extractMetadata } from './extractMetadata.js';
import { fetchPage } from './fetchPage.js';

/**
 * Fetches metadata for one URL. Never throws: a failure is returned as a
 * result object so one bad link cannot sink the whole batch.
 */
export async function fetchMetadataForUrl(rawUrl) {
    const startedAt = Date.now();

    try {
        const page = await fetchPage(rawUrl);
        const metadata = extractMetadata(page.html, page.finalUrl);

        return {
            url: rawUrl,
            ok: true,
            finalUrl: page.finalUrl,
            status: page.status,
            elapsedMs: page.elapsedMs,
            ...metadata,
            audit: auditMetadata(metadata),
        };
    } catch (error) {
        const metadataError = toMetadataError(error, rawUrl);
        return {
            url: rawUrl,
            ok: false,
            elapsedMs: Date.now() - startedAt,
            error: metadataError.toJSON(),
        };
    }
}

/**
 * Runs the batch with a bounded worker pool, preserving input order.
 * Unbounded Promise.all over a long list is a good way to get a free-tier
 * instance killed for memory.
 */
export async function fetchMetadataForUrls(urls, concurrency = FETCH_CONCURRENCY) {
    const results = new Array(urls.length);
    let cursor = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= urls.length) return;
            results[index] = await fetchMetadataForUrl(urls[index]);
        }
    };

    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, urls.length)) },
        worker
    );
    await Promise.all(workers);

    return results;
}
