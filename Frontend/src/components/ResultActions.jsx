import React from 'react';
import { FaDownload } from 'react-icons/fa';
import { VscJson } from 'react-icons/vsc';

const ResultActions = ({ copyAsJSON, downloadCSV }) => (
    <div className="flex space-x-4">
        <button 
            onClick={copyAsJSON} 
            className="flex items-center justify-center bg-purple-500 text-white rounded-md px-4 py-2 hover:bg-purple-600 transition-colors"
        >
            <VscJson className="mr-2" size={18} /> Copy JSON
        </button>
        <button 
            onClick={downloadCSV} 
            className="flex items-center justify-center bg-green-500 text-white rounded-md px-4 py-2 hover:bg-green-600 transition-colors"
        >
            <FaDownload className="mr-2" size={16} /> Download CSV
        </button>
    </div>
);

export default ResultActions;