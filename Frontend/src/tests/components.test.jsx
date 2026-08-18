import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BackendStatus from '../components/BackendStatus.jsx';
import ColdStartNotice from '../components/ColdStartNotice.jsx';
import MetadataItem from '../components/MetadataItem.jsx';
import ResultsSection from '../components/ResultsSection.jsx';
import TaggedUrls from '../components/TaggedUrls.jsx';
import { BACKEND_STATUS } from '../hooks/useBackendStatus.js';

describe('BackendStatus', () => {
    it('shows the elapsed time while the API wakes up', () => {
        render(
            <BackendStatus status={BACKEND_STATUS.WAKING} elapsedSeconds={12} onRetry={() => {}} />
        );

        expect(screen.getByRole('status')).toHaveTextContent('Waking the API… 12s');
    });

    it('shows a ready state once the API answers', () => {
        render(<BackendStatus status={BACKEND_STATUS.ONLINE} elapsedSeconds={0} onRetry={() => {}} />);

        expect(screen.getByRole('status')).toHaveTextContent('API ready');
    });

    it('offers a retry button only when the API is unreachable', async () => {
        const onRetry = vi.fn();
        const { rerender } = render(
            <BackendStatus status={BACKEND_STATUS.ONLINE} elapsedSeconds={0} onRetry={onRetry} />
        );
        expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

        rerender(
            <BackendStatus status={BACKEND_STATUS.OFFLINE} elapsedSeconds={0} onRetry={onRetry} />
        );
        await userEvent.click(screen.getByRole('button', { name: /retry/i }));
        expect(onRetry).toHaveBeenCalled();
    });
});

describe('ColdStartNotice', () => {
    it('stays out of the way until a ping has actually failed', () => {
        const { container } = render(
            <ColdStartNotice status={BACKEND_STATUS.CHECKING} elapsedSeconds={0} onRetry={() => {}} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('explains the free-tier cold start while waking', () => {
        render(
            <ColdStartNotice status={BACKEND_STATUS.WAKING} elapsedSeconds={1} onRetry={() => {}} />
        );

        expect(screen.getByText(/Waking up the API/i)).toBeInTheDocument();
        expect(screen.getByText(/free tier that sleeps/i)).toBeInTheDocument();
        expect(screen.getByText(/1 second so far/i)).toBeInTheDocument();
    });

    it('offers recovery advice when the API never answers', async () => {
        const onRetry = vi.fn();
        render(
            <ColdStartNotice status={BACKEND_STATUS.OFFLINE} elapsedSeconds={120} onRetry={onRetry} />
        );

        expect(screen.getByText(/did not respond/i)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onRetry).toHaveBeenCalled();
    });
});

describe('MetadataItem', () => {
    const success = {
        url: 'https://example.com',
        finalUrl: 'https://example.com/',
        ok: true,
        title: 'Example Title',
        description: 'Example description',
        image: 'https://example.com/hero.png',
        siteName: 'Example',
        elapsedMs: 120,
    };

    it('renders the metadata of a successful result', () => {
        render(<MetadataItem item={success} />);

        expect(screen.getByText('Example Title')).toBeInTheDocument();
        expect(screen.getByText('Example description')).toBeInTheDocument();
        expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/');
    });

    it('falls back to a placeholder when the preview image fails to load', () => {
        render(<MetadataItem item={success} />);

        fireEvent.error(screen.getByAltText('Example Title'));

        expect(screen.getByLabelText(/no preview image/i)).toBeInTheDocument();
    });

    it('opens the full image only on click and closes from the backdrop or button', async () => {
        const user = userEvent.setup();
        render(<MetadataItem item={success} />);

        const previewButton = screen.getByRole('button', {
            name: /open full image for example title/i,
        });

        fireEvent.mouseEnter(previewButton);
        expect(screen.queryByTestId('full-image-preview')).not.toBeInTheDocument();

        await user.click(previewButton);
        const dialog = screen.getByRole('dialog', { name: /full image for example title/i });
        expect(dialog).toBeInTheDocument();

        fireEvent.mouseDown(dialog);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await user.click(previewButton);

        await user.click(screen.getByRole('button', { name: /close full image/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByTestId('full-image-preview')).not.toBeInTheDocument();
    });

    it('says so plainly when a page has no title or description', () => {
        render(<MetadataItem item={{ ...success, title: '', description: '' }} />);

        expect(screen.getByText(/no title found/i)).toBeInTheDocument();
        expect(screen.getByText(/no description found/i)).toBeInTheDocument();
    });

    it('renders a failed result as an error card with its code and message', () => {
        render(
            <MetadataItem
                item={{
                    url: 'https://blocked.dev',
                    ok: false,
                    error: { code: 'BLOCKED_HOST', message: 'Points to a private address.' },
                }}
            />
        );

        expect(screen.getByText('Points to a private address.')).toBeInTheDocument();
        expect(screen.getByText('BLOCKED_HOST')).toBeInTheDocument();
        expect(screen.getByText(/refused on purpose/i)).toBeInTheDocument();
    });
});

describe('TaggedUrls', () => {
    const urls = ['https://a.dev/', 'https://b.dev/'];

    it('renders nothing when the list is empty', () => {
        const { container } = render(
            <TaggedUrls urls={[]} onRemove={() => {}} onClearAll={() => {}} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('lists each URL with a labelled remove button', async () => {
        const onRemove = vi.fn();
        render(<TaggedUrls urls={urls} onRemove={onRemove} onClearAll={() => {}} />);

        expect(screen.getByText('2 URLs queued')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Remove https://a.dev/' }));
        expect(onRemove).toHaveBeenCalledWith('https://a.dev/');
    });

    it('uses the singular for a single URL', () => {
        render(<TaggedUrls urls={['https://a.dev/']} onRemove={() => {}} onClearAll={() => {}} />);
        expect(screen.getByText('1 URL queued')).toBeInTheDocument();
    });

    it('clears the whole list on request', async () => {
        const onClearAll = vi.fn();
        render(<TaggedUrls urls={urls} onRemove={() => {}} onClearAll={onClearAll} />);

        await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
        expect(onClearAll).toHaveBeenCalled();
    });
});

describe('ResultsSection', () => {
    const results = [
        {
            url: 'https://a.dev',
            ok: true,
            title: 'A',
            description: 'a',
            audit: { score: 72 },
        },
    ];
    const actions = {
        onCopyJson: vi.fn(),
        onDownloadJson: vi.fn(),
        onDownloadCsv: vi.fn(),
    };

    it('summarises the batch', () => {
        render(
            <ResultsSection
                results={results}
                summary={{ requested: 3, succeeded: 2, failed: 1 }}
                {...actions}
            />
        );

        expect(screen.getByText('2 of 3 fetched, 1 failed')).toBeInTheDocument();
    });

    it('wires up the export buttons', async () => {
        render(<ResultsSection results={results} summary={null} {...actions} />);

        await userEvent.click(screen.getByRole('button', { name: /copy json/i }));
        await userEvent.click(screen.getByRole('button', { name: /^json$/i }));
        await userEvent.click(screen.getByRole('button', { name: /csv/i }));

        expect(actions.onCopyJson).toHaveBeenCalled();
        expect(actions.onDownloadJson).toHaveBeenCalled();
        expect(actions.onDownloadCsv).toHaveBeenCalled();
    });

    it('switches between detailed list and compact grid layouts', async () => {
        const user = userEvent.setup();
        render(<ResultsSection results={results} summary={null} {...actions} />);

        const listButton = screen.getByRole('button', { name: /list/i });
        const gridButton = screen.getByRole('button', { name: /grid/i });

        expect(listButton).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('a')).toBeInTheDocument();

        await user.click(gridButton);

        expect(gridButton).toHaveAttribute('aria-pressed', 'true');
        expect(listButton).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByText('a')).not.toBeInTheDocument();
        expect(screen.getByText('Metadata completeness')).toBeInTheDocument();
        expect(screen.getByText('72%')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /open full details for a/i }));

        expect(screen.getByRole('dialog', { name: /full details for a/i })).toBeInTheDocument();
        expect(screen.getByText('a')).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByRole('dialog', { name: /full details for a/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps the detailed list and removes the layout switch on mobile', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }));

        render(<ResultsSection results={results} summary={null} {...actions} />);

        expect(screen.queryByRole('group', { name: /result layout/i })).not.toBeInTheDocument();
        expect(screen.getByText('a')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /open full details/i })).not.toBeInTheDocument();
    });
});
