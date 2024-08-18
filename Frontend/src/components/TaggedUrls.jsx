import React from 'react';
import { FaTimes } from 'react-icons/fa';

const TaggedUrls = ({ taggedUrls, removeUrl }) => (
    <div className="flex flex-wrap gap-3 mb-4">
        {taggedUrls.map((url, index) => (
            <div key={index} className="bg-gray-200 text-gray-800 px-3 py-2 rounded-full flex items-center text-sm">
                <span className="mr-2 truncate max-w-[200px]">{url}</span>
                <button
                    type="button"
                    onClick={() => removeUrl(url)}
                    className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                    <FaTimes size={16} />
                </button>
            </div>
        ))}
    </div>
);

export default TaggedUrls;