import React from 'react';
import { FaTimes } from 'react-icons/fa';

const TaggedUrls = ({ taggedUrls, removeUrl }) => (
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
);

export default TaggedUrls;