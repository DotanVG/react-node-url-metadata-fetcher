const COLUMNS = [
    ['url', 'URL'],
    ['finalUrl', 'Final URL'],
    ['title', 'Title'],
    ['description', 'Description'],
    ['image', 'Image'],
    ['siteName', 'Site Name'],
    ['author', 'Author'],
    ['publishedAt', 'Published'],
    ['type', 'Type'],
    ['status', 'HTTP Status'],
    ['error', 'Error'],
];

/**
 * Escapes one CSV field per RFC 4180, and neutralises spreadsheet formula
 * injection — page titles are attacker-controlled, and "=HYPERLINK(...)" in a
 * downloaded CSV is a real way to hurt whoever opens it.
 */
export function escapeCsvField(value) {
    if (value === null || value === undefined) return '""';

    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

    return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(results) {
    const rows = [COLUMNS.map(([, label]) => label)];

    for (const result of results) {
        rows.push(
            COLUMNS.map(([key]) => {
                if (key === 'error') return result.error?.message ?? '';
                if (key === 'status') return result.status ?? '';
                return result[key] ?? '';
            })
        );
    }

    return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
}

export const toJson = (results) => JSON.stringify(results, null, 2);

/** Triggers a client-side file download without touching the network. */
export function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = href;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function timestampedName(extension) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `url-metadata-${stamp}.${extension}`;
}
