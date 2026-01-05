import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";
import crypto from "crypto";

export const createRide = async ( req: AuthRequest, res: Response) => {
    try {
        const { pickupCoords , destCoords , pickup , destination , fare } = req.body;
        const riderId = req.user?.userId;

        const otp = crypto.randomInt(1000, 9999).toString();
        const newRide = await prisma.ride.create({
            data: {
                riderId: riderId!,
                pickupAddress: pickup,
                dropoffAddress: destination,
                pickupLat: pickupCoords.lat,
                pickupLng: pickupCoords.lng,
                dropoffLat: destCoords.lat,
                dropoffLng: destCoords.lng,
                fare: parseFloat(fare),
                otp: otp,
                status: "PENDING"
            }
        });

        res.status(201).json({ 
            message: "Ride created successfully",
            ride: newRide 
        });
    } catch (error) {
        console.error("Error creating ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
