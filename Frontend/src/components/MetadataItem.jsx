import React from 'react';

const MetadataItem = ({ item }) => (
    <div className="border rounded p-4 bg-gray-50">
        <h4 className="font-semibold">{item.title || 'No Title'}</h4>
        <p className="text-sm text-gray-600">{item.description || 'No Description'}</p>
        {item.image && (
            <img src={item.image} alt={item.title} className="mt-2 max-w-full h-auto rounded" />
        )}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-2 block">
            {item.url}
        </a>
    </div>
);

export default MetadataItem;