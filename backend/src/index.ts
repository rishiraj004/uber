import app from './app';
import { connectDB } from './config/prisma';
import http from 'http';
import { initSocket } from './config/socket';

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
initSocket(server);

const startServer = async () => {
  try {
      await connectDB();
      server.listen(PORT, () => {
          console.log(`Server is running on port ${PORT}`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
  }
};

startServer();