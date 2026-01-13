import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares";
import prisma from "../config/prisma";
import { findNearbyCaptains } from "../services/mapService";
import redis from "../config/redis";

export const toggleAvailability = async ( req : AuthRequest , res : Response ) => {
    try {
        const captainId = req.user?.userId;
        if (!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const captain = await prisma.user.findUnique({ where: { id: captainId } , select: { isOnline: true } });
        if (!captain) {
            return res.status(404).json({ message: "Captain not found" });
        }

        const updatedCaptain = await prisma.user.update({
            where: { id: captainId },
            data: { 
                isOnline: !captain.isOnline,
                isAvailable: !captain.isOnline ? true : false 
            },
            select: { id:true, isOnline: true, fullName:true }
        });

        if(!updatedCaptain.isOnline) {
            await redis.zrem('captain_locations', updatedCaptain.id.toString());
        }

        res.status(200).json({
            message: `Captain is now ${updatedCaptain.isOnline ? "online" : "offline"}.`,
            isOnline: updatedCaptain.isOnline
        });
    } catch (error) {
        res.status(500).json({ message: "Error toggling status" });
    }
};

export const updateLocation = async ( req : AuthRequest , res : Response ) => {
    try {
        const captainId = req.user?.userId;
        const { latitude, longitude } = req.body;

        if(!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: "Latitude and Longitude are required." });
        }

        const updatedCaptain = await prisma.user.update({
            where: {id:captainId},
            data: {
                lastLat: latitude,
                lastLng: longitude
            },
            select: { id:true, lastLat:true, lastLng:true, fullName:true, isOnline:true }
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
        const captainId = req.user?.userId;
        if (!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const captain = await prisma.user.findUnique({ where: { id: captainId } , select: { isOnline: true } });
        if (!captain) {
            return res.status(404).json({ message: "Captain not found" });
        }
        res.status(200).json({ isOnline: captain.isOnline });
    } catch (error) {
        res.status(500).json({ message: "Error fetching captain status" });
    }
};