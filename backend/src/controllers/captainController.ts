import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares.js";
import prisma from "../config/prisma.js";
import { findNearbyCaptains } from "../services/mapService.js";
import redis from "../config/redis.js";

export const toggleAvailability = async ( req : AuthRequest , res : Response ) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const captainProfile = await prisma.captainProfile.findUnique({ 
            where: { userId: userId },
            select: { id: true, isOnline: true, isVerified: true }
        });
        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const goingOnline = !captainProfile.isOnline;

        // Prevent unverified captains from going online
        if (goingOnline && !captainProfile.isVerified) {
            return res.status(403).json({ 
                message: "Cannot go online. Please complete document verification first.",
                isVerified: false,
                redirectTo: "/captain/documents"
            });
        }

        const updatedCaptain = await prisma.captainProfile.update({
            where: { id: captainProfile.id },
            data: { 
                isOnline: goingOnline,
                isAvailable: goingOnline ? true : false 
            },
            select: { id: true, isOnline: true, user: { select: { fullName: true } } }
        });

        // Shift tracking
        if (goingOnline) {
            // Create a new shift when going online
            await prisma.shift.create({
                data: {
                    captainId: captainProfile.id,
                    startTime: new Date()
                }
            });
        } else {
            // End the current active shift when going offline
            const activeShift = await prisma.shift.findFirst({
                where: {
                    captainId: captainProfile.id,
                    endTime: null
                },
                orderBy: { startTime: 'desc' }
            });

            if (activeShift) {
                await prisma.shift.update({
                    where: { id: activeShift.id },
                    data: { endTime: new Date() }
                });
            }

            // Remove from Redis location tracking
            await redis.zrem('captain_locations', updatedCaptain.id.toString());
        }

        res.status(200).json({
            message: `Captain is now ${updatedCaptain.isOnline ? "online" : "offline"}.`,
            isOnline: updatedCaptain.isOnline
        });
    } catch (error) {
        console.error("Error toggling availability:", error);
        res.status(500).json({ message: "Error toggling status" });
    }
};

export const updateLocation = async ( req : AuthRequest , res : Response ) => {
    try {
        const userId = req.user?.userId;
        const { latitude, longitude } = req.body;

        if(!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: "Latitude and Longitude are required." });
        }

        const updatedCaptain = await prisma.captainProfile.update({
            where: { userId: userId },
            data: {
                lastLat: latitude,
                lastLng: longitude
            },
            select: { id: true, lastLat: true, lastLng: true, isOnline: true, user: { select: { fullName: true } } }
        });

        res.status(200).json({
            message: "Location updated successfully.",
            location: {
                latitude: updatedCaptain.lastLat,
                longitude: updatedCaptain.lastLng
            },
            isOnline: updatedCaptain.isOnline
        });
    } catch (error) {
        res.status(500).json({ message: "Error updating location" });
    }
};

export const getNearbyCaptains = async ( req : AuthRequest , res : Response ) => {
    try {
        const { latitude, longitude , radius = 5 } = req.query;

        if(latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                message: "Latitude and Longitude are required.",
                location: {
                    latitude: latitude,
                    longitude: longitude
                }
            } );
        }

        const riderLat = parseFloat(latitude as string);
        const riderLng = parseFloat(longitude as string);
        const searchRadius = parseFloat(radius as string);

        const nearbyCaptains = await findNearbyCaptains(riderLat, riderLng, searchRadius);

        res.status(200).json({ captains: nearbyCaptains });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching nearby captains" });
    }
};

export const getCaptainStatus = async ( req : AuthRequest , res : Response ) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const captainProfile = await prisma.captainProfile.findUnique({ 
            where: { userId: userId },
            select: { isOnline: true, isAvailable: true }
        });
        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }
        res.status(200).json({ 
            isOnline: captainProfile.isOnline,
            isAvailable: captainProfile.isAvailable
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching captain status" });
    }
};

export const getAnalytics = async ( req : AuthRequest , res : Response ) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const captainProfile = await prisma.captainProfile.findUnique({ 
            where: { userId: userId },
            select: { id: true }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        // Get start and end of today
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        // Calculate total earnings for today (sum of fare from COMPLETED rides)
        const completedRides = await prisma.ride.findMany({
            where: {
                captainId: captainProfile.id,
                status: 'COMPLETED',
                completedAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            select: {
                fare: true
            }
        });

        const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
        const totalTrips = completedRides.length;

        // Calculate online hours for today (sum of duration of all Shift records)
        const shifts = await prisma.shift.findMany({
            where: {
                captainId: captainProfile.id,
                startTime: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            select: {
                startTime: true,
                endTime: true
            }
        });

        let totalOnlineMinutes = 0;
        const now = new Date();

        for (const shift of shifts) {
            const shiftStart = new Date(shift.startTime);
            // If shift is still active (no endTime), use current time
            const shiftEnd = shift.endTime ? new Date(shift.endTime) : now;
            
            // Calculate duration in minutes
            const durationMs = shiftEnd.getTime() - shiftStart.getTime();
            totalOnlineMinutes += durationMs / (1000 * 60);
        }

        const totalOnlineHours = parseFloat((totalOnlineMinutes / 60).toFixed(2));

        res.status(200).json({
            totalEarnings: parseFloat(totalEarnings.toFixed(2)),
            totalTrips,
            totalOnlineHours,
            date: today.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error fetching analytics:", error);
        res.status(500).json({ message: "Error fetching analytics" });
    }
};