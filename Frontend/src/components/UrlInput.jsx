import React from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';

const UrlInput = ({ inputUrl, setInputUrl, addUrl, clearInput, handleKeyPress }) => (
    <div className="flex flex-col sm:flex-row">
        <div className="relative flex-grow mb-2 sm:mb-0 sm:mr-2">
            <input
                type="text"
                className="w-full p-2 pr-8 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="Enter a URL (http:// or https://)"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyPress={handleKeyPress}
            />
            {inputUrl && (
                <button 
                    type="button" 
                    onClick={clearInput}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                    <FaTimes />
                </button>
            )}
        </div>
        <button 
            type="button" 
            onClick={addUrl}
            className="w-full sm:w-auto bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600 transition-colors flex items-center justify-center"
        >
            <FaPlus className="mr-2" /> Add URL
        </button>
    </div>
);

export default UrlInput;