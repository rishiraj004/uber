import { Request, Response, NextFunction } from "express";
import * as rideSharingService from "../services/rideSharingService.js";

/**
 * Ride Sharing Controller - Pool/Shared rides
 */

/**
 * @desc Find matching shared rides for a new rider
 * @route POST /api/v1/ride-sharing/find-match
 * @access Private (Rider)
 */
export const findSharedRideMatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType } = req.body;

        if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
            return res.status(400).json({
                success: false,
                message: "Pickup and dropoff coordinates are required"
            });
        }

        const matches = await rideSharingService.findSharedRideMatch(
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            vehicleType || 'CAR'
        );

        return res.status(200).json({
            success: true,
            data: matches,
            sharingDiscount: 40 // Show rider the potential discount
        });
    } catch (error: any) {
        console.error("Find shared ride error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to find shared rides"
        });
    }
};

/**
 * @desc Join an existing shared ride
 * @route POST /api/v1/ride-sharing/join/:rideId
 * @access Private (Rider)
 */
export const joinSharedRide = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parentRideId = parseInt(req.params.rideId);
        const riderId = (req as any).user?.userId;
        const { 
            pickupLat, pickupLng, pickupAddress, 
            dropoffLat, dropoffLng, dropoffAddress,
            fare, vehicleType 
        } = req.body;

        if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
            return res.status(400).json({
                success: false,
                message: "Coordinates are required"
            });
        }

        const result = await rideSharingService.joinSharedRide(
            parentRideId,
            riderId,
            pickupAddress || 'Pickup Location',
            pickupLat,
            pickupLng,
            dropoffAddress || 'Dropoff Location',
            dropoffLat,
            dropoffLng,
            fare || 0,
            vehicleType || 'CAR'
        );

        return res.status(201).json({
            success: true,
            message: "Successfully joined shared ride",
            data: result
        });
    } catch (error: any) {
        console.error("Join shared ride error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to join shared ride"
        });
    }
};

/**
 * @desc Get all passengers in a shared ride group
 * @route GET /api/v1/ride-sharing/:rideId/passengers
 * @access Private (Rider/Captain)
 */
export const getSharedRidePassengers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);
        
        const passengers = await rideSharingService.getSharedRidePassengers(rideId);

        return res.status(200).json({
            success: true,
            data: passengers
        });
    } catch (error: any) {
        console.error("Get passengers error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get passengers"
        });
    }
};

/**
 * @desc Initialize a ride as shareable
 * @route POST /api/v1/ride-sharing/initialize/:rideId
 * @access Private (Rider)
 */
export const initializeSharedRide = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);

        const ride = await rideSharingService.initializeSharedRide(rideId);

        return res.status(200).json({
            success: true,
            message: "Ride is now available for sharing",
            data: ride
        });
    } catch (error: any) {
        console.error("Initialize shared ride error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to initialize shared ride"
        });
    }
};
