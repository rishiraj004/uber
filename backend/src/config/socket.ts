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
                // Get captain profile id for this user
                const captainProfile = await prisma.captainProfile.findUnique({
                    where: { userId: userId },
                    select: { id: true, isOnline: true }
                });

                if (!captainProfile || !captainProfile.isOnline) return;

                // Store captainProfile.id in Redis (since Ride.captainId references CaptainProfile)
                await redis.geoadd("captain_locations", location.longitude, location.latitude, String(captainProfile.id));

                await prisma.captainProfile.update({
                    where: { id: captainProfile.id },
                    data: { lastLat: location.latitude, lastLng: location.longitude }
                });

                const activeRide = await prisma.ride.findFirst({
                    where: {
                        captainId: captainProfile.id,
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

        // Handle real-time chat messages
        socket.on("SEND_CHAT_MESSAGE", async (data: { rideId: number; message: string }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const { rideId, message } = data;

                // Get the ride and verify user is part of it
                const ride = await prisma.ride.findUnique({
                    where: { id: rideId },
                    select: {
                        id: true,
                        status: true,
                        riderId: true,
                        captain: {
                            select: { userId: true }
                        }
                    }
                });

                if (!ride || !['ACCEPTED', 'ARRIVED', 'ONGOING'].includes(ride.status)) {
                    socket.emit("CHAT_ERROR", { message: "Chat is not available" });
                    return;
                }

                const isRider = ride.riderId === userId;
                const isCaptain = ride.captain?.userId === userId;

                if (!isRider && !isCaptain) {
                    socket.emit("CHAT_ERROR", { message: "You are not part of this ride" });
                    return;
                }

                // Get sender info
                const sender = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { fullName: true, role: true }
                });

                // Save message to database
                const chatMessage = await prisma.chatMessage.create({
                    data: {
                        rideId,
                        senderId: userId,
                        message
                    }
                });

                // Determine recipient
                const recipientId = isRider ? ride.captain?.userId : ride.riderId;

                // Send to recipient
                if (recipientId) {
                    sendNotification(recipientId, "NEW_CHAT_MESSAGE", {
                        messageId: chatMessage.id,
                        rideId,
                        senderId: userId,
                        senderName: sender?.fullName || "User",
                        senderRole: sender?.role,
                        message,
                        createdAt: chatMessage.createdAt
                    });
                }

                // Confirm to sender
                socket.emit("CHAT_MESSAGE_SENT", {
                    messageId: chatMessage.id,
                    rideId,
                    message,
                    createdAt: chatMessage.createdAt
                });

            } catch (error) {
                console.error("Error sending chat message:", error);
                socket.emit("CHAT_ERROR", { message: "Failed to send message" });
            }
        });

        // Handle typing indicator
        socket.on("TYPING_START", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const ride = await prisma.ride.findUnique({
                    where: { id: data.rideId },
                    select: {
                        riderId: true,
                        captain: { select: { userId: true } }
                    }
                });

                if (!ride) return;

                const isRider = ride.riderId === userId;
                const recipientId = isRider ? ride.captain?.userId : ride.riderId;

                if (recipientId) {
                    sendNotification(recipientId, "USER_TYPING", {
                        rideId: data.rideId,
                        userId
                    });
                }
            } catch (error) {
                console.error("Error handling typing indicator:", error);
            }
        });

        socket.on("TYPING_STOP", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const ride = await prisma.ride.findUnique({
                    where: { id: data.rideId },
                    select: {
                        riderId: true,
                        captain: { select: { userId: true } }
                    }
                });

                if (!ride) return;

                const isRider = ride.riderId === userId;
                const recipientId = isRider ? ride.captain?.userId : ride.riderId;

                if (recipientId) {
                    sendNotification(recipientId, "USER_STOPPED_TYPING", {
                        rideId: data.rideId,
                        userId
                    });
                }
            } catch (error) {
                console.error("Error handling typing stop:", error);
            }
        });

        socket.on("disconnect", async () => {
            if(userId) {
                if(socket.user?.role === 'CAPTAIN') {
                    // Get captain profile id to remove from Redis
                    const captainProfile = await prisma.captainProfile.findUnique({
                        where: { userId: userId },
                        select: { id: true }
                    });
                    if (captainProfile) {
                        await redis.zrem('captain_locations', captainProfile.id.toString()).catch(err => {
                            console.error(`Error removing captain ${captainProfile.id} from captain_locations:`, err);
                        });
                    }
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
    console.log(`Attempting to send ${event} to user ${userId}, socketId: ${socketId}, io available: ${!!io}`);
    if ( socketId && io) {
        console.log(`Successfully sending ${event} to user ${userId} with data:`, data);
        io.to(socketId).emit(event, data);
    } else {
        console.log(`Failed to send ${event} to user ${userId} - socketId or io missing`);
    }
};

export const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
};