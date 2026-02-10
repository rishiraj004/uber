import { Socket, Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import prisma from "./prisma.js";
import jwt from "jsonwebtoken";
import redis from "./redis.js";

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

    io.on("connection", async (socket: AuthenicatedSocket) => {
        const userId = Number(socket.user?.userId);
        const userRole = socket.user?.role;

        if(userId) { 
            userSocketMap.set(userId, socket.id);
            console.log(`User ${userId} connected with socket ID ${socket.id}`);

            // AUTO-REJOIN: Restore socket room membership for active rides after reconnection
            try {
                if (userRole === 'RIDER') {
                    // Rider: Find any active ride and join its room
                    const activeRide = await prisma.ride.findFirst({
                        where: {
                            riderId: userId,
                            status: { in: ['PENDING', 'ACCEPTED', 'ARRIVED', 'ONGOING'] }
                        },
                        select: { id: true, isBiddingEnabled: true }
                    });

                    if (activeRide) {
                        socket.join(`ride_${activeRide.id}`);
                        console.log(`Rider ${userId} auto-rejoined room ride_${activeRide.id}`);
                        
                        // Also join bidding room if bidding is enabled
                        if (activeRide.isBiddingEnabled) {
                            socket.join(`ride_bids_${activeRide.id}`);
                            console.log(`Rider ${userId} auto-rejoined bidding room ride_bids_${activeRide.id}`);
                        }
                    }
                } else if (userRole === 'CAPTAIN') {
                    // Captain: Find active ride they're assigned to
                    const captainProfile = await prisma.captainProfile.findUnique({
                        where: { userId: userId },
                        select: { id: true }
                    });

                    if (captainProfile) {
                        const activeRide = await prisma.ride.findFirst({
                            where: {
                                captainId: captainProfile.id,
                                status: { in: ['ACCEPTED', 'ARRIVED', 'ONGOING'] }
                            },
                            select: { id: true }
                        });

                        if (activeRide) {
                            socket.join(`ride_${activeRide.id}`);
                            console.log(`Captain ${userId} auto-rejoined room ride_${activeRide.id}`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error auto-rejoining ride rooms:', error);
            }
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

        // ============ WebRTC In-App Calling (Privacy-First) ============
        // No phone numbers exchanged - browser-to-browser calling via WebRTC

        /**
         * Initiate a call to the other party in the ride
         */
        socket.on("CALL_INITIATE", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const ride = await prisma.ride.findUnique({
                    where: { id: data.rideId },
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
                    socket.emit("CALL_ERROR", { message: "Call not available for this ride" });
                    return;
                }

                const isRider = ride.riderId === userId;
                const isCaptain = ride.captain?.userId === userId;

                if (!isRider && !isCaptain) {
                    socket.emit("CALL_ERROR", { message: "You are not part of this ride" });
                    return;
                }

                // Get caller info
                const caller = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { fullName: true, role: true }
                });

                const recipientId = isRider ? ride.captain?.userId : ride.riderId;

                if (recipientId) {
                    // Store call state in Redis
                    await redis.setex(`call:${data.rideId}`, 120, JSON.stringify({
                        callerId: userId,
                        recipientId,
                        status: 'ringing',
                        startedAt: Date.now()
                    }));

                    sendNotification(recipientId, "INCOMING_CALL", {
                        rideId: data.rideId,
                        callerId: userId,
                        callerName: caller?.fullName || "User",
                        callerRole: caller?.role
                    });
                }
            } catch (error) {
                console.error("Error initiating call:", error);
                socket.emit("CALL_ERROR", { message: "Failed to initiate call" });
            }
        });

        /**
         * Accept incoming call
         */
        socket.on("CALL_ACCEPT", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const callState = await redis.get(`call:${data.rideId}`);
                if (!callState) {
                    socket.emit("CALL_ERROR", { message: "Call not found or expired" });
                    return;
                }

                const call = JSON.parse(callState);
                
                if (call.recipientId !== userId) {
                    socket.emit("CALL_ERROR", { message: "Unauthorized" });
                    return;
                }

                // Update call state
                await redis.setex(`call:${data.rideId}`, 3600, JSON.stringify({
                    ...call,
                    status: 'connected',
                    connectedAt: Date.now()
                }));

                sendNotification(call.callerId, "CALL_ACCEPTED", {
                    rideId: data.rideId
                });

            } catch (error) {
                console.error("Error accepting call:", error);
            }
        });

        /**
         * Reject/decline incoming call
         */
        socket.on("CALL_REJECT", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const callState = await redis.get(`call:${data.rideId}`);
                if (!callState) return;

                const call = JSON.parse(callState);
                await redis.del(`call:${data.rideId}`);

                sendNotification(call.callerId, "CALL_REJECTED", {
                    rideId: data.rideId
                });
            } catch (error) {
                console.error("Error rejecting call:", error);
            }
        });

        /**
         * End ongoing call
         */
        socket.on("CALL_END", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            try {
                const callState = await redis.get(`call:${data.rideId}`);
                if (!callState) return;

                const call = JSON.parse(callState);
                await redis.del(`call:${data.rideId}`);

                // Notify the other party
                const otherPartyId = call.callerId === userId ? call.recipientId : call.callerId;
                sendNotification(otherPartyId, "CALL_ENDED", {
                    rideId: data.rideId
                });
            } catch (error) {
                console.error("Error ending call:", error);
            }
        });

        /**
         * WebRTC Signaling: Offer
         */
        socket.on("WEBRTC_OFFER", async (data: { rideId: number; offer: any }) => {
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
                    sendNotification(recipientId, "WEBRTC_OFFER", {
                        rideId: data.rideId,
                        offer: data.offer,
                        fromUserId: userId
                    });
                }
            } catch (error) {
                console.error("Error sending WebRTC offer:", error);
            }
        });

        /**
         * WebRTC Signaling: Answer
         */
        socket.on("WEBRTC_ANSWER", async (data: { rideId: number; answer: any }) => {
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
                    sendNotification(recipientId, "WEBRTC_ANSWER", {
                        rideId: data.rideId,
                        answer: data.answer,
                        fromUserId: userId
                    });
                }
            } catch (error) {
                console.error("Error sending WebRTC answer:", error);
            }
        });

        /**
         * WebRTC Signaling: ICE Candidate
         */
        socket.on("WEBRTC_ICE_CANDIDATE", async (data: { rideId: number; candidate: any }) => {
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
                    sendNotification(recipientId, "WEBRTC_ICE_CANDIDATE", {
                        rideId: data.rideId,
                        candidate: data.candidate,
                        fromUserId: userId
                    });
                }
            } catch (error) {
                console.error("Error sending ICE candidate:", error);
            }
        });

        // ============ Bidding System Socket Events ============

        /**
         * Captain submits a bid on a ride
         */
        socket.on("SUBMIT_BID", async (data: { rideId: number; offerAmount: number; estimatedArrival?: number }) => {
            const userId = socket.user?.userId;
            if (!userId || socket.user?.role !== 'CAPTAIN') return;

            // Import and call bidding service - handled by controller
            // Just emit confirmation
            socket.emit("BID_SUBMITTED", {
                rideId: data.rideId,
                message: "Processing your bid..."
            });
        });

        /**
         * Real-time bid updates to rider
         */
        socket.on("WATCH_BIDS", async (data: { rideId: number }) => {
            const userId = socket.user?.userId;
            if (!userId) return;

            // Join a room for this ride's bids
            socket.join(`ride_bids_${data.rideId}`);
        });

        socket.on("UNWATCH_BIDS", async (data: { rideId: number }) => {
            socket.leave(`ride_bids_${data.rideId}`);
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
                        await redis.zrem('captain_locations', captainProfile.id.toString()).catch((err: any) => {
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