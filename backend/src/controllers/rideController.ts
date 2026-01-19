import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";
import crypto from "crypto";
import { findNearbyCaptains } from "../services/mapService";
import { distanceBetweenPoints, calculateTotalPathDistance, calculateTotalTime } from "../utils";
import { sendNotification } from "../config/socket";
import { calculateRideFare } from "../services/rideService";
import { getDistanceAndDuration } from "../services/mapService";

export const calculateFare = async ( req: AuthRequest, res: Response) => {
    try {
        const { vehicleType , pickupCoords , destCoords } = req.body;
        if(!vehicleType || !pickupCoords || !destCoords) {
            return res.status(400).json({ message: "Vehicle type, pickup and destination coordinates are required." });
        }
        const result = await getDistanceAndDuration(
            [pickupCoords.lat, pickupCoords.lng],
            [destCoords.lat, destCoords.lng]
        );
        
        if (!result) {
            return res.status(400).json({ message: "Unable to calculate distance and duration." });
        }
        
        const { distanceKm, durationMinutes } = result;
        const fare = calculateRideFare(distanceKm, durationMinutes, vehicleType as 'CAR' | 'BIKE' | 'AUTO');
        res.status(200).json({ 
            estimatedCost: parseFloat(fare.toFixed(2)),
            distanceKm: parseFloat(distanceKm.toFixed(2)),
            durationMinutes: parseFloat(durationMinutes.toFixed(2))
        });
    } catch (error) {
        console.error("Error calculating fare:", error);
        res.status(500).json({ message: "Internal server error" });
    }   
};

// Get a specific ride by ID (for Receipt/Review pages)
export const getRideById = async (req: AuthRequest, res: Response) => {
    try {
        const { rideId } = req.params;
        const userId = req.user?.userId;
        const role = req.user?.role;

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }

        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
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
                vehicleType: true,
                estimatedDistance: true,
                estimatedDuration: true,
                routeGeometry: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                riderId: true,
                captainId: true,
                rider: {
                    select: {
                        id: true,
                        fullName: true,
                        riderProfile: {
                            select: { rating: true }
                        }
                    }
                },
                captain: {
                    select: {
                        id: true,
                        rating: true,
                        lastLat: true,
                        lastLng: true,
                        isOnline: true,
                        userId: true,
                        user: {
                            select: { fullName: true }
                        },
                        vehicleNumber: true,
                        vehicleModel: true,
                        vehicleColor: true,
                        vehicleType: true
                    }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found." });
        }

        // Verify user is associated with this ride
        let isAuthorized = ride.riderId === userId;
        if (!isAuthorized && role === "CAPTAIN") {
            const captainProfile = await prisma.captainProfile.findUnique({
                where: { userId: userId! },
                select: { id: true }
            });
            isAuthorized = captainProfile?.id === ride.captainId;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "You are not authorized to view this ride." });
        }

        // Format response based on role
        const response: any = {
            rideId: ride.id,
            status: ride.status,
            pickupAddress: ride.pickupAddress,
            pickupLat: ride.pickupLat,
            pickupLng: ride.pickupLng,
            dropoffAddress: ride.dropoffAddress,
            dropoffLat: ride.dropoffLat,
            dropoffLng: ride.dropoffLng,
            fare: ride.fare,
            vehicleType: ride.vehicleType,
            estimatedDistance: ride.estimatedDistance,
            estimatedDuration: ride.estimatedDuration,
            startedAt: ride.startedAt,
            completedAt: ride.completedAt,
            createdAt: ride.createdAt
        };

        if (role === "RIDER" && ride.captain) {
            response.otp = ride.otp;
            response.captainName = ride.captain.user.fullName;
            response.captainRating = ride.captain.rating;
            response.captainLocation = {
                lat: ride.captain.lastLat,
                lng: ride.captain.lastLng
            };
            response.captainIsOnline = ride.captain.isOnline;
            response.vehicleNumber = ride.captain.vehicleNumber;
            response.vehicleModel = ride.captain.vehicleModel;
            response.vehicleColor = ride.captain.vehicleColor;
        } else if (role === "CAPTAIN") {
            response.riderId = ride.riderId;
            response.riderName = ride.rider.fullName;
            response.riderRating = ride.rider.riderProfile?.rating || 5.0;
            response.otp = ride.otp;
        }

        res.status(200).json({ ride: response });
    } catch (error) {
        console.error("Error fetching ride by ID:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get active ride details for a user (excludes COMPLETED/CANCELLED)
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
                            id: true,
                            rating: true,
                            lastLat: true,
                            lastLng: true,
                            isOnline: true,
                            user: {
                                select: {
                                    fullName: true
                                }
                            },
                            vehicleNumber: true,
                            vehicleModel: true,
                            vehicleColor: true,
                            vehicleType: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            // Flatten captain data for response
            if (ride && ride.captain) {
                ride = {
                    rideId: ride.id,
                    status: ride.status,
                    pickupAddress: ride.pickupAddress,
                    pickupLat: ride.pickupLat,
                    pickupLng: ride.pickupLng,
                    dropoffAddress: ride.dropoffAddress,
                    dropoffLat: ride.dropoffLat,
                    dropoffLng: ride.dropoffLng,
                    fare: ride.fare,
                    otp: ride.otp,
                    rating: ride.captain.rating,
                    captainName: ride.captain.user.fullName,
                    captainRating: ride.captain.rating,
                    captainLocation: {
                        lat: ride.captain.lastLat,
                        lng: ride.captain.lastLng
                    },
                    captainIsOnline: ride.captain.isOnline,
                    vehicleNumber: ride.captain.vehicleNumber,
                    vehicleModel: ride.captain.vehicleModel,
                    vehicleColor: ride.captain.vehicleColor,
                    vehicleType: ride.captain.vehicleType
                };
            }
        } else if(role === "CAPTAIN") {
            // For captains, we need to find the captain profile first
            const captainProfile = await prisma.captainProfile.findUnique({
                where: { userId: Number(userId) },
                select: { id: true }
            });
            
            if (captainProfile) {
                const rideData = await prisma.ride.findFirst({
                    where: { captainId: captainProfile.id, status: { in: ['ACCEPTED', 'ARRIVED', 'ONGOING'] } },
                    select: {
                        id: true,
                        status: true,
                        riderId: true,
                        rider: {
                            select: {
                                fullName: true,
                                riderProfile: {
                                    select: {
                                        rating: true
                                    }
                                }
                            }
                        },
                        pickupAddress: true,
                        dropoffAddress: true,
                        pickupLat: true,
                        pickupLng: true,
                        dropoffLat: true,
                        dropoffLng: true,
                        fare: true,
                        otp: true
                    },
                    orderBy: { createdAt: 'desc' }
                });
                
                // Flatten rider data for response
                if (rideData) {
                    ride = {
                        rideId: rideData.id,
                        riderId: rideData.riderId,
                        status: rideData.status,
                        riderName: rideData.rider.fullName,
                        riderRating: rideData.rider.riderProfile?.rating || 5.0,
                        pickupAddress: rideData.pickupAddress,
                        dropoffAddress: rideData.dropoffAddress,
                        pickupLat: rideData.pickupLat,
                        pickupLng: rideData.pickupLng,
                        dropoffLat: rideData.dropoffLat,
                        dropoffLng: rideData.dropoffLng,
                        fare: rideData.fare,
                        otp: rideData.otp
                    };
                }
            }
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
        
        // Get rider info including rating
        const riderInfo = await prisma.user.findUnique({ 
            where: { id: riderId! },
            include: {
                riderProfile: {
                    select: {
                        rating: true
                    }
                }
            }
        });
        const riderName = riderInfo?.fullName || "Rider";
        const riderRating = riderInfo?.riderProfile?.rating || 5.0;

        // Get actual road distance and duration from Mapbox
        const routeData = await getDistanceAndDuration(
            [pickupCoords.lat, pickupCoords.lng],
            [destCoords.lat, destCoords.lng]
        );
        
        if (!routeData) {
            return res.status(400).json({ message: "Unable to calculate route. Please try again." });
        }

        const { distanceKm, durationMinutes, geometry } = routeData;
        const otp = crypto.randomInt(1000, 9999).toString();
        const fare = calculateRideFare(distanceKm, durationMinutes, vehicleType as 'CAR' | 'BIKE' | 'AUTO');
        
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
                estimatedDistance: parseFloat(distanceKm.toFixed(2)),
                estimatedDuration: parseFloat(durationMinutes.toFixed(2)),
                routeGeometry: geometry ? JSON.stringify(geometry) : null,
                otp: otp,
                status: "PENDING"
            }
        });

        // Start dynamic captain dispatching with radius expansion
        startCaptainDispatch(newRide.id, pickupCoords.lat, pickupCoords.lng, riderName, riderRating, distanceKm, durationMinutes);

        res.status(201).json({ 
            message: "Ride created successfully",
            ride: newRide 
        });
    } catch (error) {
        console.error("Error creating ride:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Dynamic captain dispatching with radius expansion and timeout
const activeDispatchIntervals = new Map<number, NodeJS.Timeout>();

const startCaptainDispatch = async (
    rideId: number, 
    pickupLat: number, 
    pickupLng: number,
    riderName: string,
    riderRating: number,
    distanceKm: number,
    durationMinutes: number
) => {
    let currentRadius = 3; // Start with 3km radius
    const maxRadius = 15; // Maximum 15km radius
    const radiusIncrement = 3; // Increase by 3km each time
    const scanInterval = 15000; // Re-scan every 15 seconds
    const maxDispatchTime = 120000; // 2 minutes timeout
    const startTime = Date.now();
    const notifiedCaptains = new Set<number>();

    const dispatchToCaptains = async () => {
        try {
            // Check if ride is still pending
            const ride = await prisma.ride.findUnique({ 
                where: { id: rideId },
                select: { status: true, fare: true, pickupAddress: true, dropoffAddress: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true, riderId: true }
            });
            
            if (!ride || ride.status !== "PENDING") {
                // Ride is no longer pending, stop dispatching
                clearInterval(activeDispatchIntervals.get(rideId));
                activeDispatchIntervals.delete(rideId);
                return;
            }

            // Check for timeout
            if (Date.now() - startTime > maxDispatchTime) {
                // Cancel the ride due to timeout
                await prisma.ride.update({
                    where: { id: rideId },
                    data: { status: "CANCELLED" }
                });
                
                sendNotification(ride.riderId, "RIDE_EXPIRED", {
                    rideId: rideId,
                    message: "No captains available at the moment. Please try again."
                });

                clearInterval(activeDispatchIntervals.get(rideId));
                activeDispatchIntervals.delete(rideId);
                return;
            }

            // Find nearby captains with current radius
            const nearbyCaptains = await findNearbyCaptains(pickupLat, pickupLng, currentRadius);
            console.log(`Dispatch scan: Found ${nearbyCaptains.length} captains within ${currentRadius}km for ride ${rideId}`);

            // Send notifications to new captains only
            for (const captain of nearbyCaptains) {
                if (notifiedCaptains.has(captain.id)) continue;
                
                const captainData = await prisma.captainProfile.findUnique({
                    where: { id: captain.id },
                    select: { userId: true, vehicleType: true }
                });
                
                if (captainData) {
                    notifiedCaptains.add(captain.id);
                    console.log(`Sending NEW_RIDE_REQUEST to captain userId ${captainData.userId} (radius: ${currentRadius}km)`);
                    sendNotification(
                        captainData.userId, 
                        "NEW_RIDE_REQUEST",
                        { 
                            rideId: rideId,
                            pickupAddress: ride.pickupAddress,
                            dropoffAddress: ride.dropoffAddress,
                            fare: ride.fare,
                            riderName: riderName,
                            riderRating: riderRating,
                            pickupLat: ride.pickupLat,
                            pickupLng: ride.pickupLng,
                            dropoffLat: ride.dropoffLat,
                            dropoffLng: ride.dropoffLng,
                            distanceKm: distanceKm,
                            durationMinutes: durationMinutes
                        }
                    );
                }
            }

            // Expand radius for next scan if under max
            if (currentRadius < maxRadius) {
                currentRadius = Math.min(currentRadius + radiusIncrement, maxRadius);
            }
        } catch (error) {
            console.error("Error in captain dispatch:", error);
        }
    };

    // Initial dispatch
    await dispatchToCaptains();

    // Set up interval for re-scanning with expanded radius
    const intervalId = setInterval(dispatchToCaptains, scanInterval);
    activeDispatchIntervals.set(rideId, intervalId);
};

export const acceptRide =  async ( req : AuthRequest , res : Response ) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.body;

        if(!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }

        // Get the captain profile for this user
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });

        if(!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
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
                    captainId: captainProfile.id,
                    status: "ACCEPTED"
                },
                select: {
                    id: true,
                    riderId: true,
                    captain: {
                        select: {
                            rating: true,
                            lastLat: true,
                            lastLng: true,
                            user: {
                                select: {
                                    fullName: true
                                }
                            }
                        }
                    },
                    fare: true,
                    status: true,
                    otp: true,
                    pickupAddress: true,
                    dropoffAddress: true
                }
            }),
            prisma.captainProfile.update({
                where: { id: captainProfile.id },
                data: { isAvailable: false }
            })
        ]);

        sendNotification(updatedRide.riderId , "RIDE_ACCEPTED", {
            rideId: updatedRide.id,
            captainName: updatedRide.captain?.user.fullName,
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
        const userId = req.user?.userId;
        const { rideId } = req.body;
        if(!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }
        
        // Get the captain profile for this user
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });

        if(!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });
        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }
        if(ride.captainId !== captainProfile.id) {
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
        const userId = req.user?.userId;
        const { rideId, otp } = req.body;
        if(!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(!rideId || !otp) {
            return res.status(400).json({ message: "Ride ID and OTP are required." });
        }

        // Get the captain profile for this user
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });

        if(!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });

        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if(ride.captainId !== captainProfile.id) {
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
        const userId = req.user?.userId;
        const { rideId } = req.body;

        if(!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if(!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }

        // Get the captain profile for this user
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });

        if(!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });

        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if(ride.captainId !== captainProfile.id) {
            return res.status(403).json({ message: "You are not assigned to this ride." });
        }

        if(ride.status !== "ONGOING") {
            return res.status(400).json({ message: `Cannot complete ride in ${ride.status} status.` });
        }

        // Use the upfront fare stored when ride was created
        // This ensures riders are charged what they were quoted, not penalized for captain detours
        const finalFare = ride.fare;
        
        // Calculate actual distance/duration for analytics (not for charging)
        const logs = await prisma.rideLocationLog.findMany({
            where: { rideId: Number(rideId) },
            orderBy: { timestamp: 'asc' }
        });
        const actualDistance = calculateTotalPathDistance(logs.map(log => ({ lat: log.latitude, lng: log.longitude })));
        const actualDurationMinutes = calculateTotalTime(logs);

        const [completedRide ] = await prisma.$transaction([
            prisma.ride.update({
                where: { id: Number(rideId) },
                data: { status: "COMPLETED", completedAt: new Date() },
            }),
            prisma.captainProfile.update({
                where: { id: captainProfile.id },
                data: { isAvailable: true }
            })
        ]);

        sendNotification(completedRide.riderId , "RIDE_COMPLETED", {
            rideId: completedRide.id,
            status: completedRide.status,
            fare: finalFare,
            estimatedDistance: ride.estimatedDistance,
            estimatedDuration: ride.estimatedDuration,
            actualDistance: parseFloat(actualDistance.toFixed(2)),
            actualDuration: parseFloat(actualDurationMinutes.toFixed(2)),
            message: "Thank you for riding with us!"
        });

        res.status(200).json({ 
            message: "Ride completed successfully",
            ride: completedRide,
            estimatedDistance: ride.estimatedDistance,
            estimatedDuration: ride.estimatedDuration,
            actualDistance: parseFloat(actualDistance.toFixed(2)),
            actualDuration: parseFloat(actualDurationMinutes.toFixed(2))
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

        // Check if user is the rider
        const isRider = ride.riderId === userId;

        // Check if user is the captain (need to get captain profile)
        let isCaptain = false;
        let captainProfile = null;
        if (!isRider) {
            captainProfile = await prisma.captainProfile.findUnique({
                where: { userId: userId },
                select: { id: true }
            });
            isCaptain = captainProfile ? ride.captainId === captainProfile.id : false;
        }

        if(!isRider && !isCaptain) {
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
            await prisma.captainProfile.update({
                where: { id: ride.captainId },
                data: { isAvailable: true }
            });
        }

        const partyIds = [ride.riderId];
        if (ride.captainId) {
            // Get the userId for the captain to send notification
            const captainWithUser = await prisma.captainProfile.findUnique({
                where: { id: ride.captainId },
                select: { userId: true }
            });
            if (captainWithUser) partyIds.push(captainWithUser.userId);
        }
        else {
            // Notify nearby captains (these are CaptainProfile IDs, need to get userIds)
            const nearbyCaptains = await findNearbyCaptains(ride.pickupLat, ride.pickupLng, 5);
            for (const captain of nearbyCaptains) {
                const captainData = await prisma.captainProfile.findUnique({
                    where: { id: captain.id },
                    select: { userId: true }
                });
                if (captainData) partyIds.push(captainData.userId);
            }
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

// Get ride history for riders and captains
export const getRideHistory = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const { page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        let rides;
        let total;

        if (role === "RIDER") {
            [rides, total] = await Promise.all([
                prisma.ride.findMany({
                    where: { 
                        riderId: userId,
                        status: { in: ['COMPLETED', 'CANCELLED'] }
                    },
                    select: {
                        id: true,
                        status: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        pickupLat: true,
                        pickupLng: true,
                        dropoffLat: true,
                        dropoffLng: true,
                        fare: true,
                        vehicleType: true,
                        estimatedDistance: true,
                        estimatedDuration: true,
                        routeGeometry: true,
                        startedAt: true,
                        completedAt: true,
                        createdAt: true,
                        captain: {
                            select: {
                                user: { select: { fullName: true } },
                                rating: true,
                                vehicleNumber: true,
                                vehicleModel: true,
                                vehicleColor: true
                            }
                        },
                        reviews: {
                            where: { reviewerId: userId },
                            select: { rating: true, comment: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                prisma.ride.count({
                    where: { riderId: userId, status: { in: ['COMPLETED', 'CANCELLED'] } }
                })
            ]);
        } else if (role === "CAPTAIN") {
            const captainProfile = await prisma.captainProfile.findUnique({
                where: { userId },
                select: { id: true }
            });

            if (!captainProfile) {
                return res.status(404).json({ message: "Captain profile not found" });
            }

            [rides, total] = await Promise.all([
                prisma.ride.findMany({
                    where: { 
                        captainId: captainProfile.id,
                        status: { in: ['COMPLETED', 'CANCELLED'] }
                    },
                    select: {
                        id: true,
                        status: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        pickupLat: true,
                        pickupLng: true,
                        dropoffLat: true,
                        dropoffLng: true,
                        fare: true,
                        vehicleType: true,
                        estimatedDistance: true,
                        estimatedDuration: true,
                        routeGeometry: true,
                        startedAt: true,
                        completedAt: true,
                        createdAt: true,
                        rider: {
                            select: {
                                fullName: true,
                                riderProfile: { select: { rating: true } }
                            }
                        },
                        reviews: {
                            where: { reviewerId: userId },
                            select: { rating: true, comment: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                prisma.ride.count({
                    where: { captainId: captainProfile.id, status: { in: ['COMPLETED', 'CANCELLED'] } }
                })
            ]);
        } else {
            return res.status(403).json({ message: "Invalid role" });
        }

        res.status(200).json({
            rides,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching ride history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get single ride detail with route geometry
export const getRideHistoryDetail = async (req: AuthRequest, res: Response) => {
    try {
        const { rideId } = req.params;
        const userId = req.user?.userId;

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
            include: {
                rider: { select: { fullName: true, riderProfile: { select: { rating: true } } } },
                captain: { 
                    select: { 
                        user: { select: { fullName: true } },
                        rating: true,
                        vehicleNumber: true,
                        vehicleModel: true,
                        vehicleColor: true,
                        vehicleType: true
                    }
                },
                locationLogs: {
                    orderBy: { timestamp: 'asc' },
                    select: { latitude: true, longitude: true, timestamp: true }
                },
                reviews: true
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Parse route geometry if exists
        let routeGeometry = null;
        if (ride.routeGeometry) {
            try {
                routeGeometry = JSON.parse(ride.routeGeometry);
            } catch (e) {
                console.error("Error parsing route geometry:", e);
            }
        }

        res.status(200).json({
            ride: {
                ...ride,
                routeGeometry,
                actualPath: ride.locationLogs.map(log => [log.latitude, log.longitude])
            }
        });
    } catch (error) {
        console.error("Error fetching ride detail:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};