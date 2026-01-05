import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";
import crypto from "crypto";
import { findNearbyCaptains } from "../services/mapService";
import { sendNotification } from "../config/socket";

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

        const nearbyCaptains = await findNearbyCaptains(pickupCoords.lat, pickupCoords.lng, 5);

        nearbyCaptains.forEach(captain => {
            sendNotification(
                captain.id, 
                "NEW_RIDE_REQUEST",
                { 
                    rideId: newRide.id,
                    pickupAddress: newRide.pickupAddress,
                    dropoffAddress: newRide.dropoffAddress,
                    fare: newRide.fare,
                    riderName: req.user?.name || "Rider"
                }
            );
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

