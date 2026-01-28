import { Request, Response } from "express";
import prisma from "../config/prisma";
import { sendNotification } from "../config/socket";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
    user?: {
        userId: number;
        role: string;
    };
}

// Trigger SOS Alert
export const triggerSOS = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { rideId, latitude, longitude } = req.body;

        if (!rideId || !latitude || !longitude) {
            return res.status(400).json({ message: "Missing required fields: rideId, latitude, longitude" });
        }

        // Verify ride exists and user is part of it
        const ride = await prisma.ride.findUnique({
            where: { id: rideId },
            include: {
                rider: {
                    include: {
                        riderProfile: true
                    }
                },
                captain: {
                    include: {
                        user: true
                    }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        const isRider = ride.riderId === userId;
        const isCaptain = ride.captain?.userId === userId;

        if (!isRider && !isCaptain) {
            return res.status(403).json({ message: "You are not part of this ride" });
        }

        // Create SOS Alert
        const sosAlert = await prisma.sOSAlert.create({
            data: {
                rideId,
                userId,
                latitude,
                longitude,
                status: "ACTIVE"
            }
        });

        // Get all admins to notify
        const admins = await prisma.user.findMany({
            where: { role: "ADMIN" }
        });

        // Prepare alert data
        const alertData = {
            alertId: sosAlert.id,
            rideId,
            triggeredBy: isRider ? "RIDER" : "CAPTAIN",
            userName: isRider ? ride.rider.fullName : ride.captain?.user.fullName,
            userPhone: isRider ? ride.rider.phone : ride.captain?.user.phone,
            location: { latitude, longitude },
            rideDetails: {
                pickupAddress: ride.pickupAddress,
                dropoffAddress: ride.dropoffAddress,
                status: ride.status,
                fare: ride.fare
            },
            captainDetails: ride.captain ? {
                name: ride.captain.user.fullName,
                phone: ride.captain.user.phone,
                vehicleNumber: ride.captain.vehicleNumber,
                vehicleModel: ride.captain.vehicleModel,
                vehicleColor: ride.captain.vehicleColor
            } : null,
            riderDetails: {
                name: ride.rider.fullName,
                phone: ride.rider.phone
            },
            timestamp: sosAlert.createdAt
        };

        // Notify all admins via socket
        for (const admin of admins) {
            sendNotification(admin.id, "SOS_ALERT", alertData);
        }

        // Notify the other party in the ride
        if (isRider && ride.captain) {
            sendNotification(ride.captain.userId, "SOS_TRIGGERED", {
                message: "Rider has triggered an SOS alert",
                rideId
            });
        } else if (isCaptain) {
            sendNotification(ride.riderId, "SOS_TRIGGERED", {
                message: "Captain has triggered an SOS alert",
                rideId
            });
        }

        // Get emergency contacts and notify them (in production, this would send SMS)
        let emergencyContacts: any[] = [];
        if (isRider && ride.rider.riderProfile?.emergencyContacts) {
            try {
                emergencyContacts = JSON.parse(ride.rider.riderProfile.emergencyContacts);
            } catch (e) {
                console.error("Error parsing emergency contacts:", e);
            }
        }

        // In production: Send SMS to emergency contacts
        // For now, we just return them in the response
        console.log("SOS Alert triggered!", {
            alertId: sosAlert.id,
            emergencyContacts,
            location: `https://maps.google.com/?q=${latitude},${longitude}`
        });

        res.status(201).json({
            message: "SOS alert triggered successfully",
            alert: sosAlert,
            notifiedAdmins: admins.length,
            emergencyContacts: emergencyContacts.length
        });

    } catch (error) {
        console.error("Error triggering SOS:", error);
        res.status(500).json({ message: "Failed to trigger SOS alert" });
    }
};

// Resolve SOS Alert (Admin only)
export const resolveSOS = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        if (!userId || userRole !== "ADMIN") {
            return res.status(403).json({ message: "Admin access required" });
        }

        const { alertId, resolution } = req.body;

        if (!alertId || !resolution) {
            return res.status(400).json({ message: "Missing alertId or resolution" });
        }

        const sosAlert = await prisma.sOSAlert.update({
            where: { id: alertId },
            data: {
                status: resolution, // RESOLVED or FALSE_ALARM
                resolvedAt: new Date(),
                resolvedBy: userId
            },
            include: {
                ride: true,
                user: true
            }
        });

        // Notify the user who triggered the alert
        sendNotification(sosAlert.userId, "SOS_RESOLVED", {
            alertId,
            resolution,
            message: resolution === "RESOLVED" 
                ? "Your SOS alert has been resolved. Help is on the way."
                : "Your SOS alert has been marked as resolved."
        });

        res.json({
            message: "SOS alert resolved",
            alert: sosAlert
        });

    } catch (error) {
        console.error("Error resolving SOS:", error);
        res.status(500).json({ message: "Failed to resolve SOS alert" });
    }
};

// Get active SOS alerts (Admin only)
export const getActiveAlerts = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userRole = req.user?.role;

        if (userRole !== "ADMIN") {
            return res.status(403).json({ message: "Admin access required" });
        }

        const alerts = await prisma.sOSAlert.findMany({
            where: { status: "ACTIVE" },
            include: {
                ride: {
                    include: {
                        rider: true,
                        captain: {
                            include: { user: true }
                        }
                    }
                },
                user: true
            },
            orderBy: { createdAt: "desc" }
        });

        res.json({ alerts });

    } catch (error) {
        console.error("Error fetching SOS alerts:", error);
        res.status(500).json({ message: "Failed to fetch SOS alerts" });
    }
};

// Create ride share link
export const createShareLink = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { rideId } = req.body;

        if (!rideId) {
            return res.status(400).json({ message: "Missing rideId" });
        }

        // Verify ride exists and user is the rider
        const ride = await prisma.ride.findUnique({
            where: { id: rideId }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if (ride.riderId !== userId) {
            return res.status(403).json({ message: "Only the rider can share this ride" });
        }

        // Check if active link already exists
        const existingLink = await prisma.rideShareLink.findFirst({
            where: {
                rideId,
                isActive: true,
                expiresAt: { gt: new Date() }
            }
        });

        if (existingLink) {
            return res.json({
                message: "Share link already exists",
                shareLink: existingLink,
                shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/track/${existingLink.token}`
            });
        }

        // Create new share link (expires in 24 hours or when ride completes)
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const shareLink = await prisma.rideShareLink.create({
            data: {
                rideId,
                token,
                expiresAt
            }
        });

        res.status(201).json({
            message: "Share link created",
            shareLink,
            shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/track/${token}`
        });

    } catch (error) {
        console.error("Error creating share link:", error);
        res.status(500).json({ message: "Failed to create share link" });
    }
};

// Get shared ride data (public - no auth required)
export const getSharedRide = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ message: "Missing token" });
        }

        const shareLink = await prisma.rideShareLink.findUnique({
            where: { token },
            include: {
                ride: {
                    include: {
                        captain: {
                            include: { user: { select: { fullName: true } } }
                        },
                        locationLogs: {
                            orderBy: { timestamp: "desc" },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!shareLink) {
            return res.status(404).json({ message: "Share link not found" });
        }

        if (!shareLink.isActive) {
            return res.status(410).json({ message: "This share link is no longer active" });
        }

        if (shareLink.expiresAt < new Date()) {
            return res.status(410).json({ message: "This share link has expired" });
        }

        // Return limited ride data for privacy
        const ride = shareLink.ride;
        const lastLocation = ride.locationLogs[0];

        res.json({
            rideId: ride.id,
            status: ride.status,
            pickupAddress: ride.pickupAddress,
            dropoffAddress: ride.dropoffAddress,
            pickupLat: ride.pickupLat,
            pickupLng: ride.pickupLng,
            dropoffLat: ride.dropoffLat,
            dropoffLng: ride.dropoffLng,
            captainName: ride.captain?.user.fullName || null,
            vehicleNumber: ride.captain?.vehicleNumber || null,
            vehicleModel: ride.captain?.vehicleModel || null,
            vehicleColor: ride.captain?.vehicleColor || null,
            currentLocation: lastLocation ? {
                latitude: lastLocation.latitude,
                longitude: lastLocation.longitude,
                timestamp: lastLocation.timestamp
            } : null,
            expiresAt: shareLink.expiresAt
        });

    } catch (error) {
        console.error("Error fetching shared ride:", error);
        res.status(500).json({ message: "Failed to fetch ride data" });
    }
};

// Deactivate share link
export const deactivateShareLink = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { rideId } = req.body;

        // Verify ownership
        const ride = await prisma.ride.findUnique({ where: { id: rideId } });
        if (!ride || ride.riderId !== userId) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        // Deactivate all share links for this ride
        await prisma.rideShareLink.updateMany({
            where: { rideId },
            data: { isActive: false }
        });

        res.json({ message: "Share links deactivated" });

    } catch (error) {
        console.error("Error deactivating share link:", error);
        res.status(500).json({ message: "Failed to deactivate share link" });
    }
};

// Save emergency contacts
export const saveEmergencyContacts = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { contacts } = req.body;

        if (!Array.isArray(contacts)) {
            return res.status(400).json({ message: "Contacts must be an array" });
        }

        // Validate contact structure
        for (const contact of contacts) {
            if (!contact.name || !contact.phone) {
                return res.status(400).json({ message: "Each contact must have name and phone" });
            }
        }

        // Update rider profile
        await prisma.riderProfile.update({
            where: { userId },
            data: {
                emergencyContacts: JSON.stringify(contacts)
            }
        });

        res.json({ message: "Emergency contacts saved", contacts });

    } catch (error) {
        console.error("Error saving emergency contacts:", error);
        res.status(500).json({ message: "Failed to save emergency contacts" });
    }
};

// Get emergency contacts
export const getEmergencyContacts = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const profile = await prisma.riderProfile.findUnique({
            where: { userId },
            select: { emergencyContacts: true }
        });

        let contacts: any[] = [];
        if (profile?.emergencyContacts) {
            try {
                contacts = JSON.parse(profile.emergencyContacts);
            } catch (e) {
                contacts = [];
            }
        }

        res.json({ contacts });

    } catch (error) {
        console.error("Error fetching emergency contacts:", error);
        res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
};
