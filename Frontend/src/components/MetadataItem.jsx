import React from 'react';

const MetadataItem = ({ item }) => (
    <div className="border rounded p-4 bg-gray-50 flex flex-col sm:flex-row">
        {item.image && (
            <div className="sm:w-1/3 mb-4 sm:mb-0 sm:mr-4">
                <img src={item.image} alt={item.title} className="w-full h-auto rounded object-cover" style={{maxHeight: '150px'}} />
            </div>
        )}
        <div className={`${item.image ? 'sm:w-2/3' : 'w-full'}`}>
            <h4 className="font-semibold text-lg mb-2">{item.title || 'No Title'}</h4>
            <p className="text-sm text-gray-600 mb-2">{item.description || 'No Description'}</p>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                {item.url}
            </a>
        </div>
    </div>
);

export default MetadataItem;