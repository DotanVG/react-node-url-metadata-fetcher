// Import required modules
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Apply middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(helmet()); // Set security HTTP headers
app.use(express.json()); // Parse JSON bodies

// Configure rate limiting
const requestLimiter = rateLimit({
    windowDurationInMs: 60 * 1000, // 1 minute in milliseconds
    maxRequestsPerWindow: 5, // Maximum 5 requests per window
    message: 'Too many requests, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all routes
app.use(requestLimiter);

// Define the route for fetching metadata
app.post('/fetch-metadata', async (req, res) => {
    try {
        const { urls } = req.body;

        // Fetch metadata for each URL
        const metadataResults = await Promise.all(
            urls.map(async (url) => {
                // Fetch the HTML content of the URL
                const response = await fetch(url);
                const htmlContent = await response.text();

                // Parse the HTML content
                const $ = cheerio.load(htmlContent);

                // Extract metadata
                return {
                    url,
                    title: $('title').text(),
                    description:
                        $('meta[name="description"]').attr('content') || '',
                    image: $('meta[property="og:image"]').attr('content') || '',
                };
            })
        );

        // Send the metadata results as JSON response
        res.json(metadataResults);
    } catch (error) {
        console.error('Error fetching metadata:', error);
        res.status(500).json({
            error: 'An error occurred while fetching metadata',
        });
    }
});

// Start the server and store the server instance
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Export both the Express app and the server instance
export { app, server };
