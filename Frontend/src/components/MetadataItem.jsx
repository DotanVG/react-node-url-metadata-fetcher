import React from 'react';

const MetadataItem = ({ item }) => (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row">
            <div className="sm:w-1/3 mb-4 sm:mb-0 sm:mr-4">
                {item.image ? (
                    <img src={item.image} alt={item.title} className="w-full h-auto rounded-md object-cover" style={{maxHeight: '150px'}} />
                ) : (
                    <div className="w-full h-[150px] flex items-center justify-center bg-gray-200 rounded-md">
                        <span className="text-gray-500">No image available</span>
                    </div>
                )}
            </div>
            <div className="sm:w-2/3">
                <h4 className="font-semibold text-lg mb-2">{item.title || 'No Title'}</h4>
                <p className="text-sm text-gray-600 mb-2">{item.description || 'No Description'}</p>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                    {item.url}
                </a>
            </div>
        </div>
    </div>
);

export default MetadataItem;