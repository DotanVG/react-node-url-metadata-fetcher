import http from 'node:http';

/**
 * A tiny local site the tests can point at, so nothing depends on the network
 * (or on a third party keeping their markup stable).
 */
export function startFixtureServer() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const route = routes[url.pathname];

        if (!route) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<html><head><title>Not found</title></head></html>');
            return;
        }

        route(req, res, url);
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                server,
                origin: `http://127.0.0.1:${port}`,
                url: (path) => `http://127.0.0.1:${port}${path}`,
                close: () =>
                    new Promise((done) => {
                        server.closeAllConnections?.();
                        server.close(done);
                    }),
            });
        });
    });
}

const html = (res, body, status = 200, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
    res.end(body);
};

const routes = {
    '/rich': (req, res) =>
        html(
            res,
            `<!doctype html>
<html lang="en-GB">
<head>
  <title>Fallback title that should lose</title>
  <meta name="description" content="Fallback description that should lose">
  <meta property="og:title" content="Rich Fixture Page">
  <meta property="og:description" content="A page with a full set of Open Graph tags.">
  <meta property="og:image" content="/images/hero.png">
  <meta property="og:image:alt" content="A hero image">
  <meta property="og:site_name" content="Fixture Site">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="en_GB">
  <meta name="author" content="Ada Lovelace">
  <meta name="theme-color" content="#0f172a">
  <meta name="keywords" content="metadata, open graph,  scraping ">
  <meta property="article:published_time" content="2024-05-01T10:00:00Z">
  <link rel="canonical" href="/rich">
  <link rel="icon" href="/custom-icon.png">
</head>
<body><h1>Hello</h1></body>
</html>`
        ),

    '/twitter-only': (req, res) =>
        html(
            res,
            `<html><head>
  <title>  Spaced   title \n here </title>
  <meta name="twitter:title" content="Twitter Card Title">
  <meta name="twitter:description" content="Described by a Twitter card.">
  <meta name="twitter:image" content="https://cdn.example.com/twitter.png">
</head><body></body></html>`
        ),

    '/json-ld': (req, res) =>
        html(
            res,
            `<html><head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"Structured Headline",
   "description":"Structured description.","image":["/ld-image.jpg"],
   "author":{"@type":"Person","name":"Grace Hopper"},"datePublished":"2023-01-02T00:00:00Z"}
  </script>
  <script type="application/ld+json">{ this is not valid json }</script>
</head><body></body></html>`
        ),

    '/bare': (req, res) =>
        html(res, '<html><head><title>Bare Page</title></head><body></body></html>'),

    '/redirect': (req, res, url) => {
        const hop = Number(url.searchParams.get('hop') || 0);
        res.writeHead(302, { Location: `/redirect?hop=${hop + 1}` });
        res.end();
    },

    '/redirect-once': (req, res) => {
        res.writeHead(301, { Location: '/bare' });
        res.end();
    },

    '/redirect-to-private': (req, res) => {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
    },

    '/redirect-to-file-scheme': (req, res) => {
        res.writeHead(302, { Location: 'file:///etc/passwd' });
        res.end();
    },

    '/not-found': (req, res) =>
        html(res, '<html><title>Gone</title></html>', 404),

    '/forbidden': (req, res) => html(res, 'no', 403),

    '/server-error': (req, res) => html(res, 'oops', 500),

    '/image': (req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
    },

    '/huge': (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><title>Huge</title><body>${'x'.repeat(400_000)}</body></html>`);
    },

    '/slow': (req, res) => {
        setTimeout(() => html(res, '<html><title>Slow</title></html>'), 4000).unref();
    },

    '/latin1': (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=iso-8859-1' });
        res.end(Buffer.from('<html><head><title>Caf\xe9 Cr\xe8me</title></head></html>', 'latin1'));
    },
};
