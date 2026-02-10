import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import dotenv from 'dotenv';
import { startCronJobs, stopCronJobs } from './services/cronJobService.js';
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'status' in err && err.message.includes('JSON')) {
        return res.status(400).json({ message: 'Invalid JSON payload' });
    }
    next();
});
app.use('/api', apiRoutes);
app.get('/', (req, res) => {
    res.send('Uber Backend is running');
});
// Start cron jobs when app initializes
if (process.env.NODE_ENV !== 'test') {
    startCronJobs();
}
// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Stopping cron jobs...');
    stopCronJobs();
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received. Stopping cron jobs...');
    stopCronJobs();
    process.exit(0);
});
export default app;
