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

// Determine if the application is running in test mode
const IS_TESTING = process.env.NODE_ENV === 'test';

// Apply middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(helmet()); // Set security HTTP headers
app.use(express.json()); // Parse JSON bodies

// Configure rate limiting
const requestLimiter = rateLimit({
    windowDurationInMs: IS_TESTING ? 1000 : 60 * 1000, // 1 second in test, 1 minute in production
    maxRequestsPerWindow: IS_TESTING ? 20 : 5, // 20 requests per second in test, 5 in production
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

        // Check if urls is provided and is an array
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({
                error: 'Invalid input. Please provide an array of URLs.',
            });
        }

        // Handle empty array case
        if (urls.length === 0) {
            return res.json([]);
        }

        // Fetch metadata for each URL
        const metadataResults = await Promise.all(
            urls.map(async (url) => {
                try {
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
                        image:
                            $('meta[property="og:image"]').attr('content') ||
                            '',
                    };
                } catch (error) {
                    console.error(`Error fetching metadata for ${url}:`, error);
                    return {
                        url,
                        error: 'Failed to fetch metadata for this URL',
                    };
                }
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

// Function to reset rate limiter (for testing purposes)
const resetRateLimiter = () => {
    if (IS_TESTING) {
        requestLimiter.resetKey('::ffff:127.0.0.1');
    }
};

// Export the app, server, requestLimiter, and resetRateLimiter function
export { app, server, requestLimiter, resetRateLimiter };
