import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketContext } from './socket-context';

// Use Vite env var first, fallback to older VITE_API_URL for compatibility,
// and lastly default to localhost for local development.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.log("No token found, skipping socket connection");
      return;
    }

    try {
      const newSocket = io(BACKEND_URL, {
        auth: { token }
      });

      newSocket.on("connect", () => {
        console.log("Socket connected successfully with ID:", newSocket.id);
        setSocket(newSocket);
      });

      newSocket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
      });

      newSocket.on("disconnect", () => {
        console.log("Socket disconnected");
      });

      return () => {
        console.log("Disconnecting socket");
        newSocket.disconnect();
      };
    } catch (error) {
      console.error("Failed to initialize socket:", error);
    }
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};