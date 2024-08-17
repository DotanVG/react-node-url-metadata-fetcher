import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultsSection from '../components/ResultsSection';

describe('ResultsSection', () => {
  const mockMetadata = [
    { url: 'https://example.com', title: 'Example', description: 'An example site' },
    { url: 'https://test.com', title: 'Test', description: 'A test site' }
  ];

  it('renders metadata results', () => {
    render(<ResultsSection metadata={mockMetadata} copyAsJSON={() => {}} downloadCSV={() => {}} />);
    expect(screen.getByText('Metadata Results')).toBeInTheDocument();
    mockMetadata.forEach(item => {
      expect(screen.getByText(item.title)).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
    });
  });

  it('calls copyAsJSON when Copy JSON button is clicked', () => {
    const copyAsJSON = vi.fn();
    render(<ResultsSection metadata={mockMetadata} copyAsJSON={copyAsJSON} downloadCSV={() => {}} />);
    const copyButton = screen.getByText(/Copy JSON/i);
    fireEvent.click(copyButton);
    expect(copyAsJSON).toHaveBeenCalled();
  });

  it('calls downloadCSV when Download CSV button is clicked', () => {
    const downloadCSV = vi.fn();
    render(<ResultsSection metadata={mockMetadata} copyAsJSON={() => {}} downloadCSV={downloadCSV} />);
    const downloadButton = screen.getByText(/Download CSV/i);
    fireEvent.click(downloadButton);
    expect(downloadCSV).toHaveBeenCalled();
  });
});