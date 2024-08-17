import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaggedUrls from '../components/TaggedUrls';

describe('TaggedUrls', () => {
  it('renders tagged URLs', () => {
    const urls = ['https://example.com', 'https://test.com'];
    render(<TaggedUrls taggedUrls={urls} removeUrl={() => {}} />);
    urls.forEach(url => {
      expect(screen.getByText(url)).toBeInTheDocument();
    });
  });

  it('calls removeUrl when remove button is clicked', () => {
    const removeUrl = vi.fn();
    const urls = ['https://example.com'];
    render(<TaggedUrls taggedUrls={urls} removeUrl={removeUrl} />);
    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);
    expect(removeUrl).toHaveBeenCalledWith('https://example.com');
  });
});