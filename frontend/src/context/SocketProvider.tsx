import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketContext } from './socket-context';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.log("No token found, skipping socket connection");
      return;
    }

    try {
      const newSocket = io("http://localhost:3000", {
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

      // Set socket immediately for faster availability
      setSocket(newSocket);

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