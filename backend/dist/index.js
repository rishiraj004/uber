import app from './app.js';
import { connectDB } from './config/prisma.js';
import http from 'http';
import { initSocket } from './config/socket.js';
const DEFAULT_PORT = parseInt(String(process.env.PORT || '3000'), 10);
const server = http.createServer(app);
initSocket(server);
const startServer = async () => {
    try {
        await connectDB();
        let currentPort = DEFAULT_PORT;
        const maxRetries = 10;
        let attempt = 0;
        const listen = () => {
            server.listen(currentPort, () => {
                console.log(`Server is running on port ${currentPort}`);
            });
        };
        server.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                console.warn(`Port ${currentPort} is in use.`);
                attempt += 1;
                if (attempt > maxRetries) {
                    console.error(`Unable to bind after ${maxRetries} retries. Exiting.`);
                    process.exit(1);
                }
                currentPort += 1; // try next port
                console.log(`Retrying on port ${currentPort} (attempt ${attempt}/${maxRetries})`);
                setTimeout(() => listen(), 500);
                return;
            }
            console.error('Server error:', err);
            process.exit(1);
        });
        listen();
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
