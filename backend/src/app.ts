import express, { Application } from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import captainRoutes from './routes/captainRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app: Application = express();

app.use(cors());
app.use(express.json());

app.use((err : any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if(err instanceof SyntaxError && 'status' in err && err.message.includes('JSON')) {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/captain', captainRoutes);

app.get('/', (req, res) => {
    res.send('Uber Backend is running');
});

export default app;