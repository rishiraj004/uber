import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";

let io: SocketServer;

const userSocketMap: Map<number, string> = new Map<number, string>();

export const initSocket = (httpServer: HttpServer) => {
    io = new SocketServer(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        }
    });

    io.on("connection", (socket) => {
        const userId = Number(socket.handshake.query.userId);

        if(userId) { 
            userSocketMap.set(userId, socket.id);
            console.log(`User ${userId} connected with socket ID ${socket.id}`);
        }

        socket.on("disconnect", () => {
            if(userId) {
                userSocketMap.delete(userId);
                console.log(`User ${userId} disconnected`);
            }
        });
    });

    return io;
};

export const sendNotification = (userId: number, event: string, data: any) => {
    const socketId = userSocketMap.get(userId);
    if ( socketId && io) {
        io.to(socketId).emit(event, data);
    }
};

export const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
};