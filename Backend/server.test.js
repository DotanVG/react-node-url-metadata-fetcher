// Import necessary testing utilities and the server components
import request from 'supertest';
import { app, server, resetRateLimiter, requestLimiter } from './server.js';

/**
 * Test suite for the POST /fetch-metadata endpoint
 * This suite tests various scenarios for the metadata fetching functionality,
 * including successful cases, error handling, and rate limiting.
 */

// Define a standard timeout for all tests
const TEST_TIMEOUT = 15000; // 15 seconds
const EXTENDED_TEST_TIMEOUT = 70000; // 70 seconds for production tests

describe('POST /fetch-metadata', () => {
    // Set up the test environment before all tests
    beforeAll(() => {
        // Set NODE_ENV to 'test' to enable test-specific configurations
        process.env.NODE_ENV = 'test';
    });

    // Reset rate limiter before each test to ensure a clean state
    beforeEach(async () => {
        resetRateLimiter();
    });

    // Test 1: Fetch metadata for valid URLs
    it(
        'should fetch metadata for valid URLs',
        async () => {
            // Simulate a POST request to /fetch-metadata with an array of valid URLs
            const response = await request(app)
                .post('/fetch-metadata')
                .send({
                    urls: [
                        'https://github.com/DotanVG/react-node-url-metadata-fetcher',
                        'https://www.gotolstoy.com',
                        'https://github.com/DotanVG',
                    ],
                });

            // Logging the status code and the response body
            console.log(`Response Status: ${response.statusCode}`);
            console.log('Response Body:', response.body);

            // Assertions
            expect(response.statusCode).toBe(200);
            expect(response.body).toBeInstanceOf(Array);
            expect(response.body.length).toBe(3);

            // Logging and asserting each metadata entry
            response.body.forEach((metadata, index) => {
                console.log(
                    `Metadata for URL #${index + 1} (${metadata.url}):`,
                    metadata
                );

                // Assertions for metadata properties
                expect(metadata).toHaveProperty('url');
                expect(metadata).toHaveProperty('title');
                expect(metadata).toHaveProperty('description');
                expect(metadata).toHaveProperty('image');
            });
        },
        TEST_TIMEOUT
    );

    // Test 2: Test error handling for invalid URLs
    it(
        'should handle invalid URLs gracefully',
        async () => {
            const response = await request(app)
                .post('/fetch-metadata')
                .send({ urls: ['http://localhost:1'] });

            // Expect a successful response with an error property
            expect(response.statusCode).toBe(200);
            expect(response.body[0]).toHaveProperty('error');
        },
        TEST_TIMEOUT
    );

    // Test 3: Test behavior when no URLs are provided
    it(
        'should handle empty URL array',
        async () => {
            const response = await request(app)
                .post('/fetch-metadata')
                .send({ urls: [] });

            // Expect a successful response with an empty array
            expect(response.statusCode).toBe(200);
            expect(response.body).toEqual([]);
        },
        TEST_TIMEOUT
    );

    // Test 4: Test response structure for a single valid URL
    it(
        'should return correct response structure',
        async () => {
            const response = await request(app)
                .post('/fetch-metadata')
                .send({ urls: ['https://www.example.com'] });

            // Verify the response structure
            expect(response.statusCode).toBe(200);
            expect(response.body[0]).toHaveProperty('url');
            expect(response.body[0]).toHaveProperty('title');
            expect(response.body[0]).toHaveProperty('description');
            expect(response.body[0]).toHaveProperty('image');
        },
        TEST_TIMEOUT
    );

    // Test 5: Test server response to invalid input
    it(
        'should handle invalid input',
        async () => {
            const response = await request(app)
                .post('/fetch-metadata')
                .send({ invalidKey: 'invalid data' });

            // Expect a bad request response
            expect(response.statusCode).toBe(400);
            expect(response.body).toHaveProperty('error');
        },
        TEST_TIMEOUT
    );

    // Test 6: Test rate limiting functionality
    it(
        'should enforce production rate limiting',
        async () => {
            // Temporarily set the rate limit to production values
            const originalLimit = requestLimiter.max;
            const originalWindow = requestLimiter.windowMs;
            requestLimiter.max = 5;
            requestLimiter.windowMs = 60 * 1000;

            // Create an array of requests that exceeds the rate limit
            const requests = Array(7)
                .fill()
                .map(() =>
                    request(app)
                        .post('/fetch-metadata')
                        .send({ urls: ['https://example.com'] })
                );

            // Send all requests concurrently
            const responses = await Promise.all(requests);

            // Count the number of 'too many requests' responses
            const tooManyRequests = responses.filter(
                (res) => res.statusCode === 429
            );

            // Expect at least one request to be rate limited
            expect(tooManyRequests.length).toBeGreaterThan(0);

            // Reset the rate limit to test values
            requestLimiter.max = originalLimit;
            requestLimiter.windowMs = originalWindow;
        },
        EXTENDED_TEST_TIMEOUT
    ); // Increased timeout to account for the 1-minute window
});

/**
 * After all tests have run, gracefully close the server
 * to ensure no asynchronous operations are left open.
 */
afterAll((done) => {
    console.log('Closing server...');
    server.close(() => {
        console.log('Server closed');
        done();
    });
});
