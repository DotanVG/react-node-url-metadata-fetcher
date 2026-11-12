/**
 * Where a value came from. Reported alongside the value because the source is
 * itself useful: a title that came from `<title>` rather than `og:title` still
 * renders, but it is not what the page told social platforms to show.
 *
 * `derived` means we worked the value out ourselves. The page never published
 * it, so it must never be presented as something the author provided.
 */
export const SOURCES = {
    OG: 'og',
    TWITTER: 'twitter',
    JSON_LD: 'jsonld',
    HTML: 'html',
    DERIVED: 'derived',
};

// Past this, previews load slowly and some platforms drop the image.
export const HEAVY_IMAGE_BYTES = 1024 * 1024;
