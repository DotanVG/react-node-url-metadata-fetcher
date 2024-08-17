import React from 'react';

const SubmitButton = ({ isLoading, onClick }) => (
    <button 
        type="submit" 
            className="w-full bg-blue-500 text-white rounded-md px-4 py-2 hover:bg-blue-600 transition-colors"
            disabled={isLoading}
            onClick={onClick}
    >
        {isLoading ? 'Extracting...' : 'Extract'}
    </button>
);

export default SubmitButton;