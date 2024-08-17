import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { FaGithub, FaDownload, FaPlus, FaTimes } from 'react-icons/fa';
import { VscJson } from 'react-icons/vsc';

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
      {/* Navbar */}
      <nav className="bg-gray-800 text-white p-4">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center">
          <div className="text-center sm:text-left mb-2 sm:mb-0">
            <h1 className="text-xl font-bold">URL Metadata Fetcher</h1>
            <p className="text-sm">by Dotan Veretzky</p>
          </div>
          <a 
            href="https://github.com/DotanVG/react-node-url-metadata-fetcher" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300"
          >
            <FaGithub size={24} />
          </a>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h2 className="text-2xl font-bold mb-4">Extract Metadata From URL</h2>
          <p className="mb-4 text-gray-600">Enter at least 3 URLs</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-2">
              {taggedUrls.map((url, index) => (
                <div key={index} className="bg-gray-200 text-gray-700 px-2 py-1 rounded flex items-center text-sm">
                  <span className="mr-2 truncate max-w-[150px]">{url}</span>
                  <button
                    type="button"
                    onClick={() => removeUrl(url)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <FaTimes />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex relative">
              <input
                type="text"
                className="flex-grow p-2 border rounded-l focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="Enter a URL (http:// or https://)"
                value={inputUrl}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
              />
              {inputUrl && (
                <button 
                  type="button" 
                  onClick={clearInput}
                  className="absolute right-12 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  <FaTimes />
                </button>
              )}
              <button 
                type="button" 
                onClick={addUrl}
                className="bg-blue-500 text-white rounded-r px-4 py-2 hover:bg-blue-600 transition-colors"
              >
                <FaPlus />
              </button>
            </div>
            {errorMessage && <p className="text-red-500 text-sm">{errorMessage}</p>}
            <button 
              type="submit" 
              className="w-full bg-blue-500 text-white rounded-md px-4 py-2 hover:bg-blue-600 transition-colors"
              disabled={isLoading}
            >
              {isLoading ? 'Extracting...' : 'Extract'}
            </button>
          </form>

          {/* Results Section */}
          {metadata.length > 0 && (
            <div className="mt-8">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
                <h3 className="text-xl font-semibold mb-2 sm:mb-0">Metadata Results</h3>
                <div className="flex space-x-2">
                  <button 
                    onClick={copyAsJSON} 
                    className="flex items-center justify-center bg-purple-500 text-white rounded-md px-4 py-2 hover:bg-purple-600 transition-colors w-32"
                  >
                    <VscJson className="mr-2" /> Copy JSON
                  </button>
                <button 
                  onClick={downloadCSV} 
                    className="flex items-center justify-center bg-green-500 text-white rounded-md px-4 py-2 hover:bg-green-600 transition-colors w-32"
                >
                  <FaDownload className="mr-2" /> Download CSV
                </button>
              </div>
              </div>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {metadata.map((item, index) => (
                  <div key={index} className="border rounded p-4 bg-gray-50">
                    <h4 className="font-semibold">{item.title || 'No Title'}</h4>
                    <p className="text-sm text-gray-600">{item.description || 'No Description'}</p>
                    {item.image && (
                      <img src={item.image} alt={item.title} className="mt-2 max-w-full h-auto rounded" />
                    )}
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-2 block">
                      {item.url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;