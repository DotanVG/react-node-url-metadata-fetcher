import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UrlInput from '../components/UrlInput';

describe('UrlInput', () => {
  it('renders input field and add button', () => {
    render(<UrlInput inputUrl="" setInputUrl={() => {}} addUrl={() => {}} clearInput={() => {}} handleKeyPress={() => {}} />);
    expect(screen.getByPlaceholderText(/Enter a URL/i)).toBeInTheDocument();
    expect(screen.getByText(/Add URL/i)).toBeInTheDocument();
  });

  it('calls setInputUrl when input changes', () => {
    const setInputUrl = vi.fn();
    render(<UrlInput inputUrl="" setInputUrl={setInputUrl} addUrl={() => {}} clearInput={() => {}} handleKeyPress={() => {}} />);
    const input = screen.getByPlaceholderText(/Enter a URL/i);
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    expect(setInputUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('calls addUrl when Add URL button is clicked', () => {
    const addUrl = vi.fn();
    render(<UrlInput inputUrl="https://example.com" setInputUrl={() => {}} addUrl={addUrl} clearInput={() => {}} handleKeyPress={() => {}} />);
    const addButton = screen.getByText(/Add URL/i);
    fireEvent.click(addButton);
    expect(addUrl).toHaveBeenCalled();
  });
});