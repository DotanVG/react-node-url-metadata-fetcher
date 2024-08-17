import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import Navbar from './components/Navbar';
import UrlInput from './components/UrlInput';
import TaggedUrls from './components/TaggedUrls';
import SubmitButton from './components/SubmitButton';
import ResultsSection from './components/ResultsSection';

// Create an axios instance with default config
const api = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true,
});

function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [taggedUrls, setTaggedUrls] = useState([]);
  const [metadata, setMetadata] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [csrfToken, setCsrfToken] = useState('');

  // Function to fetch CSRF token
  const fetchCsrfToken = useCallback(async () => {
    try {
      const response = await api.get('/get-csrf-token');
      setCsrfToken(response.data.csrfToken);
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      // Don't set error message here to avoid showing it on first load
    }
  }, []);

  useEffect(() => {
    fetchCsrfToken();
  }, [fetchCsrfToken]);
  
  // Function to validate URL
  const isValidUrl = (url) => {
    const pattern = new RegExp('^(https?:\\/\\/)'+ // protocol
      '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
      '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
      '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(url);
  };

  // Function to add a URL to the tagged list
  const addUrl = () => {
    const trimmedUrl = inputUrl.trim();
    if (trimmedUrl && isValidUrl(trimmedUrl) && !taggedUrls.includes(trimmedUrl)) {
      setTaggedUrls([...taggedUrls, trimmedUrl]);
      setInputUrl('');
      setErrorMessage('');
    } else if (trimmedUrl && !isValidUrl(trimmedUrl)) {
      setErrorMessage('Please enter a valid URL starting with http:// or https://');
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    setInputUrl(e.target.value);
    if (e.target.value === '') {
      setErrorMessage('');
    }
  };

  // Handle key press in input field
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputUrl.trim() === '' && taggedUrls.length >= 3) {
        handleSubmit(e);
      } else {
      addUrl();
    }
    }
  };

  // Remove a tagged URL
  const removeUrl = (urlToRemove) => {
    setTaggedUrls(taggedUrls.filter(url => url !== urlToRemove));
  };

  // Clear input field
  const clearInput = () => {
    setInputUrl('');
    setErrorMessage('');
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      addUrl();
    }
    
    if (taggedUrls.length < 3) {
      setErrorMessage('Please enter at least 3 valid URLs.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setMetadata([]);

    if (!csrfToken) {
      await fetchCsrfToken();
    }

    try {
      const response = await api.post('/fetch-metadata', 
        { urls: taggedUrls },
        { 
          headers: { 'X-CSRF-Token': csrfToken }
        }
      );
      
      setMetadata(response.data.metadataResults);
      // Update CSRF token for next request
      setCsrfToken(response.data.csrfToken);
    } catch (error) {
      console.error('Error fetching metadata:', error);
      setErrorMessage('Failed to fetch metadata. Please try again.');
      if (error.response && error.response.status === 403) {
        // If we get a 403, try to fetch a new CSRF token
        await fetchCsrfToken();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Function to download results as CSV
  const downloadCSV = () => {
    const csvContent = [
      ['URL', 'Title', 'Description'],
      ...metadata.map(item => [item.url, item.title, item.description])
    ].map(e => e.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'metadata_results.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Function to copy results as JSON
  const copyAsJSON = () => {
    const jsonContent = JSON.stringify(metadata, null, 2);
    navigator.clipboard.writeText(jsonContent).then(() => {
      alert('JSON copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy JSON: ', err);
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h2 className="text-2xl font-bold mb-4">Extract Metadata From URL</h2>
          <p className="mb-4 text-gray-600">Enter at least 3 URLs</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TaggedUrls taggedUrls={taggedUrls} removeUrl={removeUrl} />
            <UrlInput 
              inputUrl={inputUrl}
              setInputUrl={setInputUrl}
              addUrl={addUrl}
              clearInput={clearInput}
              handleKeyPress={handleKeyPress}
            />
            {errorMessage && <p className="text-red-500 text-sm">{errorMessage}</p>}
            <SubmitButton isLoading={isLoading} onClick={handleSubmit} />
          </form>

          {/* Results Section */}
          {metadata.length > 0 && (
            <ResultsSection 
              metadata={metadata} 
              copyAsJSON={copyAsJSON}
              downloadCSV={downloadCSV}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;