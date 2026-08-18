import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';

const health = () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });

const metadataResponse = (results) => ({
    ok: true,
    status: 200,
    json: async () => ({
        results,
        summary: {
            requested: results.length,
            succeeded: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
        },
    }),
});

/** Routes /health to a stub and lets each test decide what POST returns. */
const mockApi = (onPost) => {
    const fetchMock = vi.fn((url, options) =>
        options?.method === 'POST' ? onPost(url, options) : Promise.resolve(health())
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

/**
 * Renders and waits for the startup health ping to settle, so no test races
 * against the wake-up state it does not care about.
 */
const renderApp = async () => {
    const utils = render(<App />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/API ready/i));
    return utils;
};

describe('App', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders and warms the backend on load, before any interaction', async () => {
        const fetchMock = mockApi(() => Promise.resolve(metadataResponse([])));

        render(<App />);

        expect(screen.getByRole('heading', { name: /URL Metadata Fetcher/i })).toBeInTheDocument();
        await waitFor(() =>
            expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/health'))).toBe(true)
        );
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/API ready/i));
    });

    it('fetches metadata for a single URL with no three-URL minimum', async () => {
        const user = userEvent.setup();
        const fetchMock = mockApi(() =>
            Promise.resolve(
                metadataResponse([
                    {
                        url: 'https://example.com/',
                        ok: true,
                        title: 'Example Domain',
                        description: 'One URL is enough.',
                    },
                ])
            )
        );

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'example.com');
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        await user.click(screen.getByRole('button', { name: /fetch metadata/i }));

        await waitFor(() => expect(screen.getByText('Example Domain')).toBeInTheDocument());

        const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
        expect(JSON.parse(post[1].body)).toEqual({ urls: ['https://example.com/'] });
        expect(screen.getByText('1 of 1 fetched')).toBeInTheDocument();
    });

    it('submits the address still sitting in the input box', async () => {
        const user = userEvent.setup();
        const fetchMock = mockApi(() =>
            Promise.resolve(metadataResponse([{ url: 'https://solo.dev/', ok: true, title: 'Solo' }]))
        );

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'solo.dev');
        await user.click(screen.getByRole('button', { name: /fetch metadata/i }));

        await waitFor(() => expect(screen.getByText('Solo')).toBeInTheDocument());
        const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
        expect(JSON.parse(post[1].body).urls).toEqual(['https://solo.dev/']);
    });

    it('refuses to submit with nothing queued', async () => {
        const user = userEvent.setup();
        const fetchMock = mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();

        expect(screen.getByRole('button', { name: /fetch metadata/i })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: /fetch metadata/i }));

        expect(
            fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')
        ).toBe(false);
    });

    it('adds a URL on Enter and queues it', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'a.dev{Enter}');

        expect(screen.getByText('1 URL queued')).toBeInTheDocument();
        expect(screen.getByLabelText(/web address/i)).toHaveValue('');
    });

    it('accepts a pasted list of several URLs at once', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();

        const input = screen.getByLabelText(/web address/i);
        await user.click(input);
        await user.paste('a.dev, b.dev\nhttps://c.dev');

        await waitFor(() => expect(screen.getByText('3 URLs queued')).toBeInTheDocument());
    });

    it('rejects an entry that is not a web address', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'nonsense{Enter}');

        expect(await screen.findByText(/is not a valid web address/i)).toBeInTheDocument();
        expect(screen.queryByText(/URL queued/)).not.toBeInTheDocument();
    });

    it('removes a queued URL', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'a.dev{Enter}');
        await user.click(screen.getByRole('button', { name: /remove https:\/\/a\.dev/i }));

        expect(screen.queryByText('1 URL queued')).not.toBeInTheDocument();
    });

    it('shows per-URL failures alongside successes', async () => {
        const user = userEvent.setup();
        mockApi(() =>
            Promise.resolve(
                metadataResponse([
                    { url: 'https://good.dev/', ok: true, title: 'Good Page' },
                    {
                        url: 'https://bad.dev/',
                        ok: false,
                        error: { code: 'HTTP_ERROR', message: 'The page was not found (404).' },
                    },
                ])
            )
        );

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'good.dev{Enter}');
        await user.type(screen.getByLabelText(/web address/i), 'bad.dev{Enter}');
        await user.click(screen.getByRole('button', { name: /fetch metadata/i }));

        await waitFor(() => expect(screen.getByText('Good Page')).toBeInTheDocument());
        expect(screen.getByText('The page was not found (404).')).toBeInTheDocument();
        expect(screen.getByText('1 of 2 fetched, 1 failed')).toBeInTheDocument();
    });

    it("surfaces the API's error message when the request fails", async () => {
        const user = userEvent.setup();
        mockApi(() =>
            Promise.resolve({
                ok: false,
                status: 429,
                json: async () => ({
                    error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait 60 seconds.' },
                }),
            })
        );

        await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'a.dev{Enter}');
        await user.click(screen.getByRole('button', { name: /fetch metadata/i }));

        expect(
            await screen.findByText('Too many requests. Wait 60 seconds.')
        ).toBeInTheDocument();
    });

    it('strips markup smuggled into a page title', async () => {
        const user = userEvent.setup();
        mockApi(() =>
            Promise.resolve(
                metadataResponse([
                    {
                        url: 'https://evil.dev/',
                        ok: true,
                        title: '<img src=x onerror=alert(1)>Injected',
                        description: 'safe',
                    },
                ])
            )
        );

        const { container } = await renderApp();

        await user.type(screen.getByLabelText(/web address/i), 'evil.dev{Enter}');
        await user.click(screen.getByRole('button', { name: /fetch metadata/i }));

        await waitFor(() => expect(screen.getByText('Injected')).toBeInTheDocument());
        expect(container.querySelector('img[onerror]')).toBeNull();
    });

    it('loads sample URLs from the empty state', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();

        await user.click(screen.getByRole('button', { name: /try some examples/i }));

        expect(screen.getByText('5 URLs queued')).toBeInTheDocument();
        expect(screen.getByTitle('https://dotanv.vercel.app')).toBeInTheDocument();
        expect(screen.getByTitle('https://dotanv.itch.io')).toBeInTheDocument();
    });

    it('restores the queued URLs after a reload', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        const { unmount } = await renderApp();
        await user.type(screen.getByLabelText(/web address/i), 'persisted.dev{Enter}');
        await waitFor(() => expect(screen.getByText('1 URL queued')).toBeInTheDocument());
        unmount();

        await renderApp();
        expect(screen.getByText('1 URL queued')).toBeInTheDocument();
        expect(
            within(screen.getByRole('list')).getByTitle('https://persisted.dev/')
        ).toBeInTheDocument();
    });

    it('tells the user the API is waking when the health ping fails', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

        render(<App />);

        expect(await screen.findByText(/Waking up the API/i)).toBeInTheDocument();
    });

    it('toggles between light and dark themes', async () => {
        const user = userEvent.setup();
        mockApi(() => Promise.resolve(metadataResponse([])));

        await renderApp();
        const wasDark = document.documentElement.classList.contains('dark');

        await user.click(screen.getByRole('button', { name: /switch to (light|dark) theme/i }));

        expect(document.documentElement.classList.contains('dark')).toBe(!wasDark);
    });
});
