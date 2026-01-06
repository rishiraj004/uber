import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";
import crypto from "crypto";
import { findNearbyCaptains, distanceBetweenPoints } from "../services/mapService";
import { sendNotification } from "../config/socket";
import { calculateRideFare, RideFare } from "../services/rideService";

export const createRide = async ( req: AuthRequest, res: Response) => {
    try {
        const { vehicleType , pickupCoords , destCoords , pickup , destination } = req.body;

        if(!vehicleType || !pickupCoords || !destCoords || !pickup || !destination) {
            return res.status(400).json({ message: "All ride details are required." });
        }

        const riderId = req.user?.userId;

        const otp = crypto.randomInt(1000, 9999).toString();
        const distanceKm = distanceBetweenPoints(
            pickupCoords.lat, 
            pickupCoords.lng, 
            destCoords.lat, 
            destCoords.lng
        );
        const durationInMinutes = (distanceKm / 40) * 60; // Assuming average speed of 40 km/h....later will fetch from map api
        const fare = calculateRideFare(distanceKm, durationInMinutes, vehicleType as 'CAR' | 'BIKE' | 'AUTO');
        const newRide = await prisma.ride.create({
            data: {
                riderId: riderId!,
                pickupAddress: pickup,
                dropoffAddress: destination,
                pickupLat: pickupCoords.lat,
                pickupLng: pickupCoords.lng,
                dropoffLat: destCoords.lat,
                dropoffLng: destCoords.lng,
                vehicleType: vehicleType,
                fare: parseFloat(fare.toFixed(2)),
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

export const acceptRide =  async ( req : AuthRequest , res : Response ) => {
    try {
        const captainId = req.user?.userId;
        const { rideId } = req.body;

        if(!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if(ride.status !== "PENDING") {
            return res.status(400).json({ message: "Ride is no longer available." });
        }

        const updatedRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: {
                captainId: captainId,
                status: "ACCEPTED"
            },
            include: {
                captain: {
                    select: {
                        fullName: true,
                        rating: true,
                        lastLat: true,
                        lastLng: true
                    }
                }
            }
        });

        sendNotification(updatedRide.riderId , "RIDE_ACCEPTED", {
            rideId: updatedRide.id,
            captainName: updatedRide.captain?.fullName,
            status: updatedRide.status,
            captainRating: updatedRide.captain?.rating,
            captainLocation: {
                latitude: updatedRide.captain?.lastLat,
                longitude: updatedRide.captain?.lastLng
            }
        });

        res.status(200).json({ 
            message: "Ride accepted successfully",
            ride: updatedRide 
        });
    } catch (error) {
        console.error("Error accepting ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const startRide = async ( req : AuthRequest , res : Response ) => {
    try {
        const captainId = req.user?.userId;
        const { rideId, otp } = req.body;
        if(!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(!rideId || !otp) {
            return res.status(400).json({ message: "Ride ID and OTP are required." });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });

        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if(ride.captainId !== captainId) {
            return res.status(403).json({ message: "You are not assigned to this ride." });
        }

        if(ride.status !== "ACCEPTED") {
            return res.status(400).json({ message: `Cannot start ride in ${ride.status} status.` });
        }

        if(ride.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        const [ongoingRide, updatedCaptain] = await prisma.$transaction([
            prisma.ride.update({
                where: { id: Number(rideId) },
                data: { status: "ONGOING", otp: null, startedAt: new Date() },
            }),
            prisma.user.update({
                where: { id: captainId },
                data: { isOnline: false }
            })
        ]);

        await prisma.user.update({
            where: { id: captainId },
            data: { isOnline: false }
        });

        sendNotification(ongoingRide.riderId , "RIDE_STARTED", {
            rideId: ongoingRide.id,
            status: ongoingRide.status
        });

        res.status(200).json({ 
            message: "Ride started successfully",
            ride: ongoingRide 
        });
    } catch (error) {
        console.error("Error starting ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const completeRide = async ( req : AuthRequest , res : Response ) => {
    try {
        const captainId = req.user?.userId;
        const { rideId } = req.body;

        if(!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });

        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if(ride.captainId !== captainId) {
            return res.status(403).json({ message: "You are not assigned to this ride." });
        }

        if(ride.status !== "ONGOING") {
            return res.status(400).json({ message: `Cannot complete ride in ${ride.status} status.` });
        }

        const [completedRide, updatedCaptain] = await prisma.$transaction([
            prisma.ride.update({
                where: { id: Number(rideId) },
                data: { status: "COMPLETED", completedAt: new Date() },
            }),
            prisma.user.update({
                where: { id: captainId },
                data: { isOnline: false }
            })
        ]);

        sendNotification(completedRide.riderId , "RIDE_COMPLETED", {
            rideId: completedRide.id,
            status: completedRide.status,
            fare: completedRide.fare,
            message: "Thank you for riding with us!"
        });

        res.status(200).json({ 
            message: "Ride completed successfully",
            ride: completedRide
        });
    } catch (error) {
        console.error("Error completing ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};