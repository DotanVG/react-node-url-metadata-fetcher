import React from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';

const UrlInput = ({ inputUrl, setInputUrl, addUrl, clearInput, handleKeyPress }) => (
    <div className="flex relative">
        <input
            type="text"
            className="flex-grow p-2 border rounded-l focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            placeholder="Enter a URL (http:// or https://)"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
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
);

export default UrlInput;