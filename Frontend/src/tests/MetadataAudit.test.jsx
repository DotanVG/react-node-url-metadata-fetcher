import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MetadataAudit from '../components/MetadataAudit.jsx';
import ScoreRing from '../components/ScoreRing.jsx';

const field = (overrides) => ({
    key: 'title',
    label: 'Title',
    tag: 'og:title',
    importance: 'essential',
    hint: 'The headline every platform shows when the link is shared.',
    status: 'published',
    source: 'og',
    ...overrides,
});

const buildAudit = (fields, overrides = {}) => ({
    score: 70,
    published: fields.filter((f) => f.status === 'published').length,
    inferred: fields.filter((f) => f.status === 'inferred').length,
    missing: fields.filter((f) => f.status === 'missing').length,
    total: fields.length,
    missingEssential: fields
        .filter((f) => f.status === 'missing' && f.importance === 'essential')
        .map((f) => f.tag),
    fields,
    ...overrides,
});

const FIELDS = [
    field({ key: 'title', label: 'Title', tag: 'og:title', status: 'published', source: 'og' }),
    field({
        key: 'description',
        label: 'Description',
        tag: 'og:description',
        hint: 'The summary shown under the headline.',
        status: 'missing',
        source: null,
    }),
    field({
        key: 'siteName',
        label: 'Site name',
        tag: 'og:site_name',
        importance: 'recommended',
        hint: 'Names the publisher instead of showing a bare domain.',
        status: 'inferred',
        source: 'derived',
    }),
    field({
        key: 'themeColor',
        label: 'Theme colour',
        tag: 'meta[name="theme-color"]',
        importance: 'optional',
        hint: 'Tints browser chrome on mobile to match the site.',
        status: 'missing',
        source: null,
    }),
];

const RESULT = { title: 'A real title', siteName: 'example.com' };

describe('MetadataAudit', () => {
    it('starts collapsed, showing only the summary', async () => {
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);

        const toggle = screen.getByRole('button', { name: /metadata analysis/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Site name')).not.toBeInTheDocument();
    });

    it('expands and collapses on click', async () => {
        const user = userEvent.setup();
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);
        const toggle = screen.getByRole('button', { name: /metadata analysis/i });

        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Site name')).toBeInTheDocument();

        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Site name')).not.toBeInTheDocument();
    });

    it('groups fields by how much they matter', async () => {
        const user = userEvent.setup();
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        expect(screen.getByRole('heading', { name: /Essential/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Recommended/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Nice to have/ })).toBeInTheDocument();
    });

    it('states each status in words, not colour alone', async () => {
        const user = userEvent.setup();
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        expect(screen.getByText('Published')).toBeInTheDocument();
        expect(screen.getByText('Inferred')).toBeInTheDocument();
        expect(screen.getByText('Missing')).toBeInTheDocument();
        // A missing optional field is softened to "Not set" rather than "Missing".
        expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('distinguishes a value the page published from one we guessed', async () => {
        const user = userEvent.setup();
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        const items = screen.getAllByRole('listitem');
        const siteName = items.find((li) => within(li).queryByText('Site name'));

        expect(within(siteName).getByText('Inferred')).toBeInTheDocument();
        expect(within(siteName).getByText(/Guessed by us/)).toBeInTheDocument();
    });

    it('names the tag needed to fix each gap', async () => {
        const user = userEvent.setup();
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        expect(screen.getByText('og:title')).toBeInTheDocument();
        expect(screen.getByText('og:description')).toBeInTheDocument();
    });

    it('shows the value when present and the hint when not', async () => {
        const user = userEvent.setup();
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        // Published: the actual value. Missing: the hint explaining what it is for.
        expect(screen.getByText('A real title')).toBeInTheDocument();
        expect(screen.getByText('The summary shown under the headline.')).toBeInTheDocument();
    });

    it('reports where a value came from', async () => {
        const user = userEvent.setup();
        const fields = [field({ status: 'published', source: 'twitter' })];
        render(<MetadataAudit audit={buildAudit(fields)} result={RESULT} />);
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        expect(screen.getByText(/Twitter Card/)).toBeInTheDocument();
    });

    it('warns about missing essential tags while collapsed', () => {
        render(<MetadataAudit audit={buildAudit(FIELDS)} result={RESULT} />);

        expect(screen.getByText(/Missing og:description/)).toBeInTheDocument();
        expect(screen.getByText(/look broken on most platforms/)).toBeInTheDocument();
    });

    it('stays quiet when nothing essential is missing', () => {
        const fields = [field({ status: 'published' })];
        render(<MetadataAudit audit={buildAudit(fields)} result={RESULT} />);

        expect(screen.queryByText(/look broken/)).not.toBeInTheDocument();
    });

    it('joins array values such as keywords for display', async () => {
        const user = userEvent.setup();
        const fields = [
            field({ key: 'keywords', label: 'Keywords', tag: 'keywords', status: 'published' }),
        ];
        render(
            <MetadataAudit
                audit={buildAudit(fields)}
                result={{ keywords: ['alpha', 'beta'] }}
            />
        );
        await user.click(screen.getByRole('button', { name: /metadata analysis/i }));

        expect(screen.getByText('alpha, beta')).toBeInTheDocument();
    });

    it('renders nothing when there is no audit', () => {
        const { container } = render(<MetadataAudit audit={undefined} result={RESULT} />);
        expect(container).toBeEmptyDOMElement();

        const { container: empty } = render(
            <MetadataAudit audit={{ fields: [] }} result={RESULT} />
        );
        expect(empty).toBeEmptyDOMElement();
    });

    it('exposes the score to assistive technology', () => {
        render(<MetadataAudit audit={buildAudit(FIELDS, { score: 42 })} result={RESULT} />);

        expect(screen.getByRole('img', { name: /score 42 out of 100/i })).toBeInTheDocument();
    });
});

describe('ScoreRing', () => {
    it('labels the score for screen readers', () => {
        render(<ScoreRing score={88} />);
        expect(screen.getByRole('img', { name: 'Metadata score 88 out of 100' })).toBeInTheDocument();
    });

    it.each([
        [95, 'stroke-emerald-500'],
        [60, 'stroke-amber-500'],
        [20, 'stroke-rose-500'],
    ])('uses the right tone for a score of %i', (score, expected) => {
        const { container } = render(<ScoreRing score={score} />);
        expect(container.querySelector(`.${expected}`)).toBeInTheDocument();
    });

    it('clamps an out-of-range score instead of overdrawing the arc', () => {
        const { container } = render(<ScoreRing score={150} />);
        const arc = container.querySelectorAll('circle')[1];
        const [filled, total] = arc.getAttribute('stroke-dasharray').split(' ').map(Number);

        expect(filled).toBeCloseTo(total, 5);
    });
});
