import React from 'react';
import ResultActions from './ResultActions';
import MetadataItem from './MetadataItem';

const ResultsSection = ({ metadata, copyAsJSON, downloadCSV }) => (
    <div className="mt-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
            <h3 className="text-2xl font-semibold mb-4 sm:mb-0">Metadata Results</h3>
            <ResultActions copyAsJSON={copyAsJSON} downloadCSV={downloadCSV} />
        </div>
        <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
            {metadata.map((item, index) => (
                <MetadataItem key={index} item={item} />
            ))}
        </div>
    </div>
);

export default ResultsSection;