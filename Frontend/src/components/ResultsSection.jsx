import React from 'react';
import ResultActions from './ResultActions';
import MetadataItem from './MetadataItem';

const ResultsSection = ({ metadata, copyAsJSON, downloadCSV }) => (
    <div className="mt-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
            <h3 className="text-xl font-semibold mb-2 sm:mb-0">Metadata Results</h3>
            <ResultActions copyAsJSON={copyAsJSON} downloadCSV={downloadCSV} />
        </div>
        <div className="space-y-4 max-h-96 overflow-y-auto">
            {metadata.map((item, index) => (
                <MetadataItem key={index} item={item} />
            ))}
        </div>
    </div>
);

export default ResultsSection;