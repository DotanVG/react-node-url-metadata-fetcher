import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Navbar from './components/Navbar';
import UrlInput from './components/UrlInput';
import TaggedUrls from './components/TaggedUrls';
import SubmitButton from './components/SubmitButton';
import ResultsSection from './components/ResultsSection';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Create an axios instance with default config
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true,
});

function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [taggedUrls, setTaggedUrls] = useState([]);
  const [metadata, setMetadata] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  // Function to fetch CSRF token
  const fetchCsrfToken = useCallback(async () => {
    try {
      const response = await api.get('/get-csrf-token');
      setCsrfToken(response.data.csrfToken);
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      toast.error('Failed to fetch CSRF token. Please try again.');
    }
  }, []);

  // Fetch CSRF token on component mount
  useEffect(() => {
    fetchCsrfToken();
  }, [fetchCsrfToken]);

  // Function to validate URL
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  };

  const addUrl = () => {
    const trimmedUrl = inputUrl.trim();
    if (trimmedUrl && isValidUrl(trimmedUrl) && !taggedUrls.includes(trimmedUrl)) {
      setTaggedUrls([...taggedUrls, trimmedUrl]);
      setInputUrl('');
      toast.success('URL added successfully');
    } else if (trimmedUrl && !isValidUrl(trimmedUrl)) {
      toast.error('Please enter a valid URL starting with http:// or https://');
    } else if (taggedUrls.includes(trimmedUrl)) {
      toast.warning('This URL has already been added');
    }
  };
  
  // Handle key press in input field
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputUrl.trim() === '' && taggedUrls.length >= 3) {
        handleSubmit(e);
      } else if (inputUrl.trim() === '' && taggedUrls.length < 3) {
        toast.warning('Please enter at least 3 valid URLs before submitting.');
      } else {
        addUrl();
      }
    }
  };

  // Remove a tagged URL
  const removeUrl = (urlToRemove) => {
    setTaggedUrls(taggedUrls.filter(url => url !== urlToRemove));
    toast.info('URL removed');
  };

  // Clear input field
  const clearInput = () => {
    setInputUrl('');
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      addUrl();
    }
    
    if (taggedUrls.length < 3) {
      toast.error('Please enter at least 3 valid URLs.');
      return;
    }

    setIsLoading(true);
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
      
      // Sanitize the metadata results
      const sanitizedMetadata = response.data.metadataResults.map(item => ({
        ...item,
        title: DOMPurify.sanitize(item.title),
        description: DOMPurify.sanitize(item.description),
        image: DOMPurify.sanitize(item.image)
      }));

      setMetadata(sanitizedMetadata);
      setCsrfToken(response.data.csrfToken);
      toast.success('Metadata fetched successfully');
    } catch (error) {
      console.error('Error fetching metadata:', error);
      toast.error('Failed to fetch metadata. Please try again.');
      if (error.response && error.response.status === 403) {
        // If we get a 403, try to fetch a new CSRF token
        await fetchCsrfToken();
      }
    } finally {
      setIsLoading(false);
    }
  };
  
// Downloads metadata as a CSV file named "metadata_results.csv"
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
      toast.success('JSON copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy JSON: ', err);
      toast.error('Failed to copy JSON to clipboard');
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6 sm:p-8">
          <h2 className="text-3xl font-bold mb-6">Extract Metadata From URL</h2>
          <p className="mb-6 text-xl text-gray-600">Enter at least 3 URLs</p>
          <form onSubmit={handleSubmit} className="space-y-6">
            <TaggedUrls taggedUrls={taggedUrls} removeUrl={removeUrl} />
            <UrlInput 
              inputUrl={inputUrl}
              setInputUrl={setInputUrl}
              addUrl={addUrl}
              clearInput={clearInput}
              handleKeyPress={handleKeyPress}
            />
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
      <ToastContainer position="bottom-right" />
    </div>
  );
}

export default App;