import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";
import crypto from "crypto";
import { findNearbyCaptains } from "../services/mapService";
import { distanceBetweenPoints, calculateTotalPathDistance, calculateTotalTime } from "../utils";
import { sendNotification } from "../config/socket";
import { calculateRideFare, calculateAllFareOptions, VehicleClass } from "../services/rideService";
import { getDistanceAndDuration } from "../services/mapService";
import { calculateSurgeMultiplier, getSurgeInfo } from "../services/surgeService";
import { authorizePayment, capturePayment, cancelPayment, getOrCreateRazorpayCustomer } from "../services/paymentService";
import { sendPushNotification } from "../services/pushNotificationService";

export const calculateFare = async ( req: AuthRequest, res: Response) => {
    try {
        const { vehicleType, vehicleClass, pickupCoords, destCoords } = req.body;
        if(!pickupCoords || !destCoords) {
            return res.status(400).json({ message: "Pickup and destination coordinates are required." });
        }
        const result = await getDistanceAndDuration(
            [pickupCoords.lat, pickupCoords.lng],
            [destCoords.lat, destCoords.lng]
        );
        
        if (!result) {
            return res.status(400).json({ message: "Unable to calculate distance and duration." });
        }
        
        const { distanceKm, durationMinutes } = result;
        
        // Get surge multiplier based on pickup location
        const surgeMultiplier = await calculateSurgeMultiplier(pickupCoords.lat, pickupCoords.lng);
        const surgeInfo = await getSurgeInfo(pickupCoords.lat, pickupCoords.lng);

        // If specific vehicle type requested, return single fare
        if (vehicleType) {
            const fare = calculateRideFare(
                distanceKm, 
                durationMinutes, 
                vehicleType as 'CAR' | 'BIKE' | 'AUTO',
                (vehicleClass as VehicleClass) || 'ECONOMY',
                surgeMultiplier
            );
            return res.status(200).json({ 
                estimatedCost: parseFloat(fare.toFixed(2)),
                distanceKm: parseFloat(distanceKm.toFixed(2)),
                durationMinutes: parseFloat(durationMinutes.toFixed(2)),
                surgeMultiplier,
                surgeActive: surgeInfo.isActive,
                surgeMessage: surgeInfo.displayText
            });
        }

        // Return all fare options with surge applied
        const fareOptions = calculateAllFareOptions(distanceKm, durationMinutes, surgeMultiplier);
        
        res.status(200).json({ 
            fareOptions,
            distanceKm: parseFloat(distanceKm.toFixed(2)),
            durationMinutes: parseFloat(durationMinutes.toFixed(2)),
            surgeMultiplier,
            surgeActive: surgeInfo.isActive,
            surgeMessage: surgeInfo.displayText
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
        const { vehicleType, vehicleClass, pickupCoords, destCoords, pickup, destination } = req.body;

        if(!vehicleType || !pickupCoords || !destCoords || !pickup || !destination) {
            return res.status(400).json({ message: "All ride details are required." });
        }

        const riderId = req.user?.userId;

        // PREVENT DUPLICATE RIDES: Check if rider already has an active ride
        const existingActiveRide = await prisma.ride.findFirst({
            where: {
                riderId: riderId!,
                status: { in: ['PENDING', 'ACCEPTED', 'ARRIVED', 'ONGOING'] }
            },
            select: { id: true, status: true }
        });

        if (existingActiveRide) {
            return res.status(400).json({ 
                message: `You already have an active ride (ID: ${existingActiveRide.id}, Status: ${existingActiveRide.status}). Please complete or cancel it before booking a new ride.`,
                existingRideId: existingActiveRide.id
            });
        }
        
        // Get rider info including rating and Stripe customer ID
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
        
        // Calculate surge multiplier
        const surgeMultiplier = await calculateSurgeMultiplier(pickupCoords.lat, pickupCoords.lng);
        
        // Calculate fare with surge and vehicle class
        const selectedVehicleClass = (vehicleClass as VehicleClass) || 'ECONOMY';
        const fare = calculateRideFare(
            distanceKm, 
            durationMinutes, 
            vehicleType as 'CAR' | 'BIKE' | 'AUTO',
            selectedVehicleClass,
            surgeMultiplier
        );
        
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
                vehicleType: vehicleType,
                vehicleClass: selectedVehicleClass,
                fare: parseFloat(fare.toFixed(2)),
                surgeMultiplier: surgeMultiplier,
                estimatedDistance: parseFloat(distanceKm.toFixed(2)),
                estimatedDuration: parseFloat(durationMinutes.toFixed(2)),
                routeGeometry: geometry ? JSON.stringify(geometry) : null,
                otp: otp,
                status: "PENDING",
                paymentStatus: "PENDING"
                // paymentMode is set later by rider after ride is accepted
            }
        });

        // Start dynamic captain dispatching with radius expansion
        startCaptainDispatch(newRide.id, pickupCoords.lat, pickupCoords.lng, riderName, riderRating, distanceKm, durationMinutes, selectedVehicleClass);

        res.status(201).json({ 
            message: "Ride created successfully",
            ride: {
                ...newRide,
                surgeMultiplier,
                surgeApplied: surgeMultiplier > 1.0
            }
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
    durationMinutes: number,
    vehicleClass: VehicleClass = 'ECONOMY'
) => {
    let currentRadius = 3; // Start with 3km radius
    const maxRadius = 15; // Maximum 15km radius
    const radiusIncrement = 3; // Increase by 3km each time
    const scanInterval = 15000; // Re-scan every 15 seconds
    const maxDispatchTime = 120000; // 2 minutes timeout
    const startTime = Date.now();
    const notifiedCaptains = new Set<number>();

    // Helper to send search status to rider
    const sendSearchStatus = (riderId: number, captainsNotified: number, elapsedSeconds: number) => {
        sendNotification(riderId, "RIDE_SEARCHING", {
            rideId,
            currentRadius,
            maxRadius,
            captainsNotified,
            elapsedSeconds,
            maxSeconds: maxDispatchTime / 1000,
            message: captainsNotified > 0 
                ? `Searching... ${captainsNotified} captain(s) notified within ${currentRadius}km`
                : `Expanding search to ${currentRadius}km radius...`
        });
    };

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

            // Send search status update to rider
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            sendSearchStatus(ride.riderId, notifiedCaptains.size, elapsedSeconds);

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

        // Get the captain profile for this user including verification status
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true, isVerified: true, licenseExpiry: true, rcExpiry: true }
        });

        if(!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        // Security: Verify captain is verified and documents are not expired
        if(!captainProfile.isVerified) {
            return res.status(403).json({ message: "Your account is not verified. Please complete document verification." });
        }

        const now = new Date();
        if(captainProfile.licenseExpiry && captainProfile.licenseExpiry < now) {
            return res.status(403).json({ message: "Your driving license has expired. Please update your documents." });
        }
        if(captainProfile.rcExpiry && captainProfile.rcExpiry < now) {
            return res.status(403).json({ message: "Your vehicle registration has expired. Please update your documents." });
        }

        const ride = await prisma.ride.findUnique({ 
            where: { id: Number(rideId) },
            include: { rider: true }
        });
        if(!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if(ride.status !== "PENDING") {
            return res.status(400).json({ message: "Ride is no longer available." });
        }

        // Authorize payment (create Razorpay order)
        let paymentOrderId: string | null = null;
        try {
            if (ride.rider.razorpayCustomerId && ride.fare) {
                paymentOrderId = await authorizePayment(ride.id, ride.fare, ride.rider.razorpayCustomerId);
            }
        } catch (paymentError: any) {
            console.error("Payment authorization failed:", paymentError);
            // Continue without payment if Razorpay is not configured
            // In production, you might want to reject the ride here
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

        // Send socket notification
        sendNotification(updatedRide.riderId , "CAPTAIN_ARRIVED", {
            rideId: updatedRide.id,
            status: updatedRide.status,
            message: "Your captain has arrived at the pickup location."
        });

        // Send push notification (critical - works when app is in background)
        await sendPushNotification(updatedRide.riderId, 'CAPTAIN_ARRIVED', {
            rideId: updatedRide.id
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

        // Send socket notification
        sendNotification(ongoingRide.riderId , "RIDE_STARTED", {
            rideId: ongoingRide.id,
            status: ongoingRide.status
        });

        // Send push notification
        await sendPushNotification(ongoingRide.riderId, 'RIDE_STARTED', {
            rideId: ongoingRide.id
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

        // PAYMENT VERIFICATION: Ride cannot be completed until payment is collected
        if(ride.paymentStatus !== "CAPTURED") {
            return res.status(400).json({ 
                message: "Payment has not been collected. Please collect payment before completing the ride.",
                paymentMode: ride.paymentMode,
                paymentStatus: ride.paymentStatus
            });
        }

        // Use the upfront fare stored when ride was created
        const finalFare = ride.fare;
        
        // Calculate actual distance/duration for analytics
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

        // Send socket notification
        sendNotification(completedRide.riderId , "RIDE_COMPLETED", {
            rideId: completedRide.id,
            status: completedRide.status,
            fare: finalFare,
            paymentMode: ride.paymentMode,
            estimatedDistance: ride.estimatedDistance,
            estimatedDuration: ride.estimatedDuration,
            actualDistance: parseFloat(actualDistance.toFixed(2)),
            actualDuration: parseFloat(actualDurationMinutes.toFixed(2)),
            message: "Thank you for riding with us!"
        });

        // Send push notification
        await sendPushNotification(completedRide.riderId, 'RIDE_COMPLETED', {
            rideId: completedRide.id,
            fare: finalFare
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

        // Cancel/void any authorized payment
        try {
            await cancelPayment(ride.id);
        } catch (paymentError) {
            console.error("Payment cancellation failed:", paymentError);
            // Continue with ride cancellation even if payment cancellation fails
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

/**
 * Check surge pricing for a location
 */
export const checkSurge = async (req: AuthRequest, res: Response) => {
    try {
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({ message: "Latitude and longitude are required" });
        }

        const surgeInfo = await getSurgeInfo(lat, lng);

        res.status(200).json({
            surgeMultiplier: surgeInfo.multiplier,
            surgeActive: surgeInfo.isActive,
            message: surgeInfo.displayText
        });
    } catch (error) {
        console.error("Error checking surge:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Captain initiates payment collection (when ride is ONGOING and at destination)
 * This tells the rider to make payment based on the selected payment mode
 */
export const initiatePaymentCollection = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        // Get the captain profile
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const ride = await prisma.ride.findUnique({ 
            where: { id: Number(rideId) },
            include: { rider: { select: { fullName: true } } }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if (ride.captainId !== captainProfile.id) {
            return res.status(403).json({ message: "You are not assigned to this ride" });
        }

        if (ride.status !== "ONGOING") {
            return res.status(400).json({ message: "Can only collect payment for ongoing rides" });
        }

        if (ride.paymentStatus === "CAPTURED") {
            return res.status(400).json({ message: "Payment has already been collected" });
        }

        // Notify rider to pay based on payment mode
        sendNotification(ride.riderId, "PAYMENT_REQUESTED", {
            rideId: ride.id,
            fare: ride.fare,
            paymentMode: ride.paymentMode,
            message: ride.paymentMode === 'CASH' 
                ? `Please pay ₹${ride.fare} in cash to your captain`
                : ride.paymentMode === 'UPI'
                ? `Please pay ₹${ride.fare} via UPI`
                : `Please complete payment of ₹${ride.fare} in the app`
        });

        res.status(200).json({
            message: "Payment request sent to rider",
            paymentMode: ride.paymentMode,
            fare: ride.fare
        });
    } catch (error) {
        console.error("Error initiating payment collection:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Captain confirms cash/UPI payment received
 * Only for CASH and UPI payment modes
 */
export const confirmCashPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const ride = await prisma.ride.findUnique({ where: { id: Number(rideId) } });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if (ride.captainId !== captainProfile.id) {
            return res.status(403).json({ message: "You are not assigned to this ride" });
        }

        if (ride.status !== "ONGOING") {
            return res.status(400).json({ message: "Can only confirm payment for ongoing rides" });
        }

        if (ride.paymentMode === "IN_APP") {
            return res.status(400).json({ message: "In-app payments must be confirmed through the payment gateway" });
        }

        if (ride.paymentStatus === "CAPTURED") {
            return res.status(400).json({ message: "Payment has already been confirmed" });
        }

        // Update payment status
        const updatedRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: {
                paymentStatus: "CAPTURED",
                paymentCollectedAt: new Date()
            }
        });

        // Notify rider that payment is confirmed
        sendNotification(ride.riderId, "PAYMENT_CONFIRMED", {
            rideId: ride.id,
            fare: ride.fare,
            paymentMode: ride.paymentMode,
            message: "Payment has been confirmed by your captain"
        });

        res.status(200).json({
            message: "Payment confirmed successfully",
            ride: updatedRide
        });
    } catch (error) {
        console.error("Error confirming cash payment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Rider confirms in-app payment (after Razorpay success)
 * This verifies the Razorpay signature and marks payment as captured
 */
export const confirmInAppPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        // Validate Razorpay payment fields
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            return res.status(400).json({ message: "Missing Razorpay payment details" });
        }

        const ride = await prisma.ride.findUnique({ 
            where: { id: Number(rideId) },
            include: { captain: { select: { userId: true } } }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if (ride.riderId !== userId) {
            return res.status(403).json({ message: "You are not the rider for this trip" });
        }

        if (ride.paymentMode !== "IN_APP" && ride.paymentMode !== "UPI") {
            return res.status(400).json({ message: "This ride is not set for in-app/UPI payment" });
        }

        if (ride.paymentStatus === "CAPTURED") {
            return res.status(400).json({ message: "Payment has already been confirmed" });
        }

        // Verify Razorpay signature
        const crypto = require('crypto');
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(body)
            .digest('hex');
        
        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: "Invalid payment signature" });
        }

        // Update payment status
        const updatedRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: {
                paymentStatus: "CAPTURED",
                paymentCollectedAt: new Date()
            }
        });

        // Also update payment record if exists
        await prisma.payment.updateMany({
            where: { rideId: Number(rideId) },
            data: {
                status: "CAPTURED",
                capturedAt: new Date()
            }
        });

        // Notify captain that payment is complete
        if (ride.captain?.userId) {
            sendNotification(ride.captain.userId, "PAYMENT_SUCCESSFUL", {
                rideId: ride.id,
                amount: ride.fare,
                fare: ride.fare,
                paymentMode: ride.paymentMode,
                paymentMethod: 'RAZORPAY',
                message: `Payment of ₹${ride.fare} received successfully`
            });
        }

        res.status(200).json({
            message: "Payment confirmed successfully",
            ride: updatedRide
        });
    } catch (error) {
        console.error("Error confirming in-app payment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get payment status for a ride
 */
export const getPaymentStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
            select: {
                id: true,
                fare: true,
                paymentMode: true,
                paymentStatus: true,
                paymentCollectedAt: true,
                riderId: true,
                captainId: true
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Check if user is rider or captain (simplified check)
        const isRider = ride.riderId === userId;
        // For captain check, we need to get the captain profile
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId: userId },
            select: { id: true }
        });
        const isCaptain = captainProfile && ride.captainId === captainProfile.id;

        if (!isRider && !isCaptain) {
            return res.status(403).json({ message: "You are not part of this ride" });
        }

        res.status(200).json({
            rideId: ride.id,
            fare: ride.fare,
            paymentMode: ride.paymentMode,
            paymentStatus: ride.paymentStatus,
            paymentCollectedAt: ride.paymentCollectedAt
        });
    } catch (error) {
        console.error("Error getting payment status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Update payment method for a ride (PATCH /ride/:rideId/payment-method)
 * Rider selects payment method after ride is accepted
 */
export const updatePaymentMethod = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.params;
        const { paymentMethod } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        // Validate payment method
        const validPaymentMethods = ['CASH', 'UPI', 'IN_APP'];
        if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({ 
                message: "Invalid payment method. Must be CASH, UPI, or IN_APP" 
            });
        }

        // Get the ride
        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
            select: {
                id: true,
                riderId: true,
                captainId: true,
                status: true,
                paymentMode: true,
                paymentStatus: true,
                fare: true,
                captain: { select: { userId: true } }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        // Only the rider can update payment method
        if (ride.riderId !== userId) {
            return res.status(403).json({ message: "Only the rider can update payment method" });
        }

        // Can only update payment method for ACCEPTED, ARRIVED, or ONGOING rides
        const allowedStatuses = ['ACCEPTED', 'ARRIVED', 'ONGOING'];
        if (!allowedStatuses.includes(ride.status)) {
            return res.status(400).json({ 
                message: `Cannot update payment method for ride in ${ride.status} status` 
            });
        }

        // Cannot update if payment is already captured
        if (ride.paymentStatus === 'CAPTURED') {
            return res.status(400).json({ message: "Payment has already been processed" });
        }

        // Update the payment method
        const updatedRide = await prisma.ride.update({
            where: { id: Number(rideId) },
            data: { paymentMode: paymentMethod }
        });

        // Notify the captain about payment method change
        if (ride.captain?.userId) {
            sendNotification(ride.captain.userId, "PAYMENT_METHOD_UPDATED", {
                rideId: ride.id,
                paymentMethod: paymentMethod,
                fare: ride.fare,
                message: paymentMethod === 'CASH' 
                    ? `Rider will pay ₹${ride.fare} in cash`
                    : paymentMethod === 'UPI'
                    ? `Rider will pay ₹${ride.fare} via UPI`
                    : `Rider will pay ₹${ride.fare} online through the app`
            });
        }

        res.status(200).json({
            message: "Payment method updated successfully",
            rideId: updatedRide.id,
            paymentMethod: updatedRide.paymentMode
        });
    } catch (error) {
        console.error("Error updating payment method:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};