import request from 'supertest'; // Importing supertest to simulate HTTP requests
import { app, server } from './server.js'; // Import the server along with the app

/**
 * Test suite for the POST /fetch-metadata endpoint
 * This test simulates sending a POST request to the /fetch-metadata route
 * with a list of URLs and expects the server to return the metadata
 * (title, description, and image) for each URL.
 */
describe('POST /fetch-metadata', () => {
    // Test case for fetching metadata from valid URLs
    it('should fetch metadata for valid URLs', async () => {
        // Simulate a POST request to /fetch-metadata with an array of URLs
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
            expect(metadata).toHaveProperty('title');
            expect(metadata).toHaveProperty('description');
            expect(metadata).toHaveProperty('image');
        });
    }, 10000); // Increased timeout to allow for network latency
});

/**
 * After all tests have run, gracefully close the server
 * to ensure no asynchronous operations are left open.
 */
afterAll(() => {
    console.log('Closing server...');
    server.close(); // Close the server after all tests have run to prevent Jest from hanging
});
