import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketContext } from './socket-context';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const token = localStorage.getItem("token");

      const newSocket = io("http://localhost:3000", {
        auth: { token }
      });

      newSocket.on("connect", () => {
        setSocket(newSocket);
      });

      return () => {
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