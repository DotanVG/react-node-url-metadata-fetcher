import React from 'react';
import { FaGithub } from 'react-icons/fa';

const Navbar = () => (
    <nav className="bg-gray-800 text-white py-6">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center px-4">
            <div className="text-center sm:text-left mb-4 sm:mb-0">
                <h1 className="text-3xl font-bold">URL Metadata Fetcher</h1>
                <p className="text-lg mt-2">by Dotan Veretzky</p>
            </div>
            <a 
                href="https://github.com/DotanVG/react-node-url-metadata-fetcher" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white hover:text-gray-300"
            >
                <FaGithub size={44} />
            </a>
        </div>
    </nav>
);

export default Navbar;