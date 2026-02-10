import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares.js";
import prisma from "../config/prisma.js";
import { sendNotification } from "../config/socket.js";

// Send a chat message during an active ride
export const sendChatMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId, message } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId || !message) {
            return res.status(400).json({ message: "Ride ID and message are required" });
        }

        // Get the ride and verify user is part of it
        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
            select: {
                id: true,
                status: true,
                riderId: true,
                captain: {
                    select: {
                        userId: true
                    }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Check if ride is active
        if (!['ACCEPTED', 'ARRIVED', 'ONGOING'].includes(ride.status)) {
            return res.status(400).json({ message: "Chat is only available during active rides" });
        }

        // Verify user is either the rider or the captain
        const isRider = ride.riderId === userId;
        const isCaptain = ride.captain?.userId === userId;

        if (!isRider && !isCaptain) {
            return res.status(403).json({ message: "You are not part of this ride" });
        }

        // Create the chat message
        const chatMessage = await prisma.chatMessage.create({
            data: {
                rideId: Number(rideId),
                senderId: userId,
                message
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true,
                        role: true
                    }
                }
            }
        });

        // Determine recipient and send real-time notification
        const recipientId = isRider ? ride.captain?.userId : ride.riderId;

        if (recipientId) {
            sendNotification(recipientId, "NEW_CHAT_MESSAGE", {
                messageId: chatMessage.id,
                rideId: rideId,
                senderId: userId,
                senderName: chatMessage.sender.fullName,
                senderRole: chatMessage.sender.role,
                message: message,
                createdAt: chatMessage.createdAt
            });
        }

        res.status(201).json({
            message: "Message sent successfully",
            chatMessage: {
                id: chatMessage.id,
                message: chatMessage.message,
                senderId: chatMessage.senderId,
                senderName: chatMessage.sender.fullName,
                senderRole: chatMessage.sender.role,
                createdAt: chatMessage.createdAt
            }
        });
    } catch (error) {
        console.error("Error sending chat message:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get chat messages for a ride
export const getChatMessages = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        // Get the ride and verify user is part of it
        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
            select: {
                riderId: true,
                captain: {
                    select: {
                        userId: true
                    }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Verify user is either the rider or the captain
        const isRider = ride.riderId === userId;
        const isCaptain = ride.captain?.userId === userId;

        if (!isRider && !isCaptain) {
            return res.status(403).json({ message: "You are not part of this ride" });
        }

        // Get all messages for this ride
        const messages = await prisma.chatMessage.findMany({
            where: { rideId: Number(rideId) },
            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true,
                        role: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        res.status(200).json({
            messages: messages.map(msg => ({
                id: msg.id,
                message: msg.message,
                senderId: msg.senderId,
                senderName: msg.sender.fullName,
                senderRole: msg.sender.role,
                isOwn: msg.senderId === userId,
                createdAt: msg.createdAt
            }))
        });
    } catch (error) {
        console.error("Error fetching chat messages:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
