import { Socket, Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import prisma from "./prisma";
import jwt from "jsonwebtoken";
import redis from "./redis";

let io: SocketServer;

const userSocketMap: Map<number, string> = new Map<number, string>();
const lastDbSaveMap: Map<number, number> = new Map<number, number>();

interface AuthenicatedSocket extends Socket {
    user?: {
        userId: number;
        role: 'RIDER' | 'CAPTAIN';
    }
}

export const initSocket = (httpServer: HttpServer) => {
    io = new SocketServer(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        }
    });

    io.use((socket: AuthenicatedSocket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token as string;

        if (!token) {
            return next(new Error("Authentication error: Token not provided"));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number; role: 'RIDER' | 'CAPTAIN' };
            socket.user = decoded;
            next();
        } catch (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on("connection", (socket: AuthenicatedSocket) => {
        const userId = Number(socket.user?.userId);

        if(userId) { 
            userSocketMap.set(userId, socket.id);
            console.log(`User ${userId} connected with socket ID ${socket.id}`);
        }

        socket.on("CAPTAIN_LOCATION_UPDATE", async (data: { location: { latitude: number; longitude: number }}) => {
            const { location } = data;
            const userId = socket.user?.userId;
            const role = socket.user?.role;
            if (!userId || role !== 'CAPTAIN') return;
            try {
                await redis.geoadd("captain_locations", location.longitude, location.latitude, String(userId));

                const updatedUser = await prisma.user.update({
                    where: { id: userId, isOnline: true },
                    data: { lastLat: location.latitude, lastLng: location.longitude }
                });
                const activeRide = await prisma.ride.findFirst({
                    where: {
                        captainId: userId,
                        status: { in: ["ACCEPTED", "ARRIVED", "ONGOING"] }
                    },
                    select: { id: true, riderId: true, status: true }
                });

                if (activeRide) {
                    sendNotification(activeRide.riderId, "CAPTAIN_LOCATION_UPDATE", {
                        rideId: activeRide.id,
                        latitude: location.latitude,
                        longitude: location.longitude
                    });

                    if(activeRide.status === "ONGOING") {
                        const lastSaved = lastDbSaveMap.get(userId) || 0;
                        const now = Date.now();
                        if (now - lastSaved > 10000) {
                            await prisma.rideLocationLog.create({
                                data: {
                                    rideId: activeRide.id,
                                    latitude: location.latitude,
                                    longitude: location.longitude,
                                    timestamp: new Date()
                                }
                            });
                            lastDbSaveMap.set(userId, now);
                        }
                    }
                }
            } catch (error) {
                console.error("Error updating captain location:", error);
            }
        });

        socket.on("disconnect", async () => {
            if(userId) {
                if(socket.user?.role === 'CAPTAIN') {
                    await redis.zrem('captain_locations', userId.toString()).catch(err => {
                        console.error(`Error removing captain ${userId} from online_captains:`, err);
                    });
                }
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