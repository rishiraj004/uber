import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";
import crypto from "crypto";
import { findNearbyCaptains } from "../services/mapService";
import { distanceBetweenPoints, calculateTotalPathDistance, calculateTotalTime } from "../utils";
import { sendNotification } from "../config/socket";
import { calculateRideFare } from "../services/rideService";

export const calculateFare = async ( req: AuthRequest, res: Response) => {
    try {
        const { vehicleType , pickupCoords , destCoords } = req.body;
        if(!vehicleType || !pickupCoords || !destCoords) {
            return res.status(400).json({ message: "Vehicle type, pickup and destination coordinates are required." });
        }
        const distanceKm = distanceBetweenPoints(
            pickupCoords.lat, 
            pickupCoords.lng,
            destCoords.lat,
            destCoords.lng
        );
        const durationInMinutes = (distanceKm / 40) * 60; // Assuming average speed of 40 km/h....later will fetch from map api
        const fare = calculateRideFare(distanceKm, durationInMinutes, vehicleType as 'CAR' | 'BIKE' | 'AUTO');  
        res.status(200).json({ 
            estimatedCost: parseFloat(fare.toFixed(2))
        });
    } catch (error) {
        console.error("Error calculating fare:", error);
        res.status(500).json({ message: "Internal server error" });
    }   
};

export const getRideDetails = async ( req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        
        if(!userId) {
            return res.status(400).json({ message: "User ID is required." });
        }

        const role = req.user?.role;
        let ride;
        if(role === "RIDER") {
            ride = await prisma.ride.findFirst({
                where: { riderId: Number(userId), status: { in: ['PENDING', 'ACCEPTED', 'ARRIVED', 'ONGOING'] } },
                select: {
                    id: true, 
                    status: true,
                    pickupAddress: true,
                    pickupLat: true,
                    pickupLng: true,
                    dropoffAddress: true,
                    dropoffLat: true,
                    dropoffLng: true,
                    fare: true,
                    otp: true,
                    captain: {
                        select: {
                            fullName: true,
                            rating: true,
                            lastLat: true,
                            lastLng: true,
                            isOnline: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        } else if(role === "CAPTAIN") {
            ride = await prisma.ride.findFirst({
                where: { captainId: Number(userId), status: { in: ['ACCEPTED', 'ARRIVED', 'ONGOING'] } },
                select: {
                    rider: {
                        select: {
                            fullName: true,
                            rating: true
                        }
                    },
                    pickupAddress: true,
                    dropoffAddress: true,
                    pickupLat: true,
                    pickupLng: true,
                    dropoffLat: true,
                    dropoffLng: true
                },
                orderBy: { createdAt: 'desc' }
            });
        }
        res.status(200).json({ ride });
    } catch (error) {
        console.error("Error fetching ride details:", error);
        res.status(500).json({ message: "Internal server error" });
    }   
};

export const createRide = async ( req: AuthRequest, res: Response) => {
    try {
        const { vehicleType , pickupCoords , destCoords , pickup , destination } = req.body;

        if(!vehicleType || !pickupCoords || !destCoords || !pickup || !destination) {
            return res.status(400).json({ message: "All ride details are required." });
        }

        const riderId = req.user?.userId;
        const riderName = await prisma.user.findUnique({ where: { id: riderId! } }).then(user => user?.fullName || "Rider");

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
                    riderName: riderName
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

        const [updatedRide] = await prisma.$transaction([
            prisma.ride.update({
                where: { id: Number(rideId) },
                data: {
                    captainId: captainId,
                    status: "ACCEPTED"
                },
                select: {
                    id: true,
                    riderId: true,
                    captain: {
                        select: {
                            fullName: true,
                            rating: true,
                            lastLat: true,
                            lastLng: true
                        }
                    },
                    fare: true,
                    status: true,
                    otp: true,
                    pickupAddress: true,
                    dropoffAddress: true
                }
            }),
            prisma.user.update({
                where: { id: captainId },
                data: { isAvailable: false }
            })
        ]);

        sendNotification(updatedRide.riderId , "RIDE_ACCEPTED", {
            rideId: updatedRide.id,
            captainName: updatedRide.captain?.fullName,
            status: updatedRide.status,
            captainRating: updatedRide.captain?.rating,
            captainLocation: {
                latitude: updatedRide.captain?.lastLat,
                longitude: updatedRide.captain?.lastLng
            },
            fare: updatedRide.fare,
            otp: updatedRide.otp,
            message: "Your ride has been accepted!"
        });

        res.status(200).json({ 
            message: "Ride accepted successfully",
            ride: {
                rideId: updatedRide.id,
                riderId: updatedRide.riderId,
                fare: updatedRide.fare,
                status: updatedRide.status,
                pickupAddress: updatedRide.pickupAddress,
                dropoffAddress: updatedRide.dropoffAddress
            }
        });
    } catch (error) {
        console.error("Error accepting ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const arrivedAtPickup = async ( req : AuthRequest , res : Response ) => {
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
        if(ride.status !== "ACCEPTED") {
            return res.status(400).json({ message: `Cannot mark arrival for ride in ${ride.status} status.` });
        }
        const updatedRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: { status: "ARRIVED" },
        });
        sendNotification(updatedRide.riderId , "CAPTAIN_ARRIVED", {
            rideId: updatedRide.id,
            status: updatedRide.status,
            message: "Your captain has arrived at the pickup location."
        });
        res.status(200).json({
            message: "Marked arrival at pickup successfully",
            ride: updatedRide 
        });
    } catch (error) {
        console.error("Error marking arrival at pickup:", error);
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

        if(ride.status !== "ARRIVED") {
            return res.status(400).json({ message: `Cannot start ride in ${ride.status} status.` });
        }

        if(ride.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        const ongoingRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: { status: "ONGOING", otp: null, startedAt: new Date() },
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

        const logs = await prisma.rideLocationLog.findMany({
            where: { rideId: Number(rideId) },
            orderBy: { timestamp: 'asc' }
        });

        const totalDistance = calculateTotalPathDistance(logs.map(log => ({ lat: log.latitude, lng: log.longitude })));
        const durationInMinutes = calculateTotalTime(logs);

        const finalFare = calculateRideFare(totalDistance, durationInMinutes, ride?.vehicleType as 'CAR' | 'BIKE' | 'AUTO');

        const [completedRide ] = await prisma.$transaction([
            prisma.ride.update({
                where: { id: Number(rideId) },
                data: { status: "COMPLETED", completedAt: new Date(), fare: parseFloat(finalFare.toFixed(2)) },
            }),
            prisma.user.update({
                where: { id: captainId },
                data: { isAvailable: true }
            })
        ]);

        sendNotification(completedRide.riderId , "RIDE_COMPLETED", {
            rideId: completedRide.id,
            status: completedRide.status,
            fare: completedRide.fare,
            distance: parseFloat(totalDistance.toFixed(2)),
            duration: parseFloat(durationInMinutes.toFixed(2)),
            message: "Thank you for riding with us!"
        });

        res.status(200).json({ 
            message: "Ride completed successfully",
            ride: completedRide,
            distance: parseFloat(totalDistance.toFixed(2)),
            duration: parseFloat(durationInMinutes.toFixed(2))
        });
    } catch (error) {
        console.error("Error completing ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const cancelRide = async ( req : AuthRequest , res : Response ) => {
    try {
        console.log("Cancel Ride Request Body:", req.body);
        const userId = req.user?.userId;
        const { rideId } = req.body;
        if(!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }
        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }
        if(ride.riderId !== userId && ride.captainId !== userId) {
            return res.status(403).json({ message: "You are not associated with this ride." });
        }
        if(ride.status === "COMPLETED" || ride.status === "CANCELLED") {
            return res.status(400).json({ message: `Cannot cancel ride in ${ride.status} status.` });
        }
        const cancelledRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: { status: "CANCELLED" },
        });

        if (ride.captainId) {
            await prisma.user.update({
                where: { id: ride.captainId },
                data: { isAvailable: true }
            });
        }

        const partyIds = [ride.riderId];
        if (ride.captainId) partyIds.push(ride.captainId);
        else {
            partyIds.push(...(await findNearbyCaptains(ride.pickupLat, ride.pickupLng, 5)).map(captain => captain.id));
        }

        partyIds.forEach(id => {
            sendNotification(id, "RIDE_CANCELLED", {
                rideId: cancelledRide.id,
                status: cancelledRide.status,
                message: "The ride has been cancelled."
            });
        });

        res.status(200).json({ 
            message: "Ride cancelled successfully",
            ride: cancelledRide 
        });
    } catch (error) {
        console.error("Error cancelling ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getRidePath = async ( req : AuthRequest , res : Response ) => {
    try {
        const { rideId } = req.params;
        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }
        const logs = await prisma.rideLocationLog.findMany({
            where: { rideId: Number(rideId) },
            orderBy: { timestamp: 'asc' },
            select: {
                latitude: true,
                longitude: true,
                timestamp: true
            }
        });
        let durationInMinutes = calculateTotalTime(logs);
        res.status(200).json({
            path: logs.map(log => ({ lat: log.latitude, lng: log.longitude })),
            duration: parseFloat(durationInMinutes.toFixed(2))
        });
    } catch (error) {
        console.error("Error fetching ride path:", error);
        res.status(500).json({ message: "Internal server error" }); 

    };
};