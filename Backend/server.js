import { createApp } from './src/app.js';
import { PORT } from './src/config.js';

const app = createApp();

const server = app.listen(PORT, () => {
    console.log(`URL Metadata Fetcher API listening on port ${PORT}`);
});

// Render and most PaaS providers send SIGTERM before recycling an instance.
// Draining in-flight requests avoids a burst of failures on every redeploy.
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        console.log(`${signal} received, shutting down.`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
    });
}

export { app, server };
