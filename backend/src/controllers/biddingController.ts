import { Request, Response, NextFunction } from "express";
import * as biddingService from "../services/biddingService.js";
import { getIo } from "../config/socket.js";
import prisma from "../config/prisma.js";

/**
 * Bidding Controller - Handles negotiation mode endpoints
 */

/**
 * @desc Captain places a bid on a ride
 * @route POST /api/v1/bids/:rideId
 * @access Private (Captain)
 */
export const createBid = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);
        const { offerAmount, estimatedArrival } = req.body;
        
        // Get captain profile ID from auth middleware
        const captainId = (req as any).captainProfile?.id;
        
        if (!captainId) {
            return res.status(400).json({
                success: false,
                message: "Captain profile not found"
            });
        }

        // Security: Verify captain is verified before allowing bids
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { id: captainId },
            select: { isVerified: true, licenseExpiry: true, rcExpiry: true }
        });

        if (!captainProfile?.isVerified) {
            return res.status(403).json({
                success: false,
                message: "Your account is not verified. Please complete document verification."
            });
        }

        const now = new Date();
        if (captainProfile.licenseExpiry && captainProfile.licenseExpiry < now) {
            return res.status(403).json({
                success: false,
                message: "Your driving license has expired. Please update your documents."
            });
        }
        if (captainProfile.rcExpiry && captainProfile.rcExpiry < now) {
            return res.status(403).json({
                success: false,
                message: "Your vehicle registration has expired. Please update your documents."
            });
        }

        const result = await biddingService.createBid(
            rideId,
            captainId,
            offerAmount,
            estimatedArrival
        );

        // Notify rider in real-time via room
        const io = getIo();
        io.to(`ride_bids_${rideId}`).emit("NEW_BID", {
            bid: result.bid,
            isAcceptingRiderPrice: result.isAcceptingRiderPrice
        });

        return res.status(201).json({
            success: true,
            message: result.isAcceptingRiderPrice 
                ? "Bid accepted at rider's price" 
                : "Counter-offer submitted",
            data: result.bid
        });
    } catch (error: any) {
        console.error("Create bid error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to create bid"
        });
    }
};

/**
 * @desc Captain updates their bid
 * @route PATCH /api/v1/bids/:rideId
 * @access Private (Captain)
 */
export const updateBid = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);
        const { offerAmount, estimatedArrival } = req.body;
        const captainId = (req as any).captainProfile?.id;

        if (!captainId) {
            return res.status(400).json({
                success: false,
                message: "Captain profile not found"
            });
        }

        const updatedBid = await biddingService.updateBid(
            rideId,
            captainId,
            offerAmount
        );

        // Notify rider
        const io = getIo();
        io.to(`ride_bids_${rideId}`).emit("BID_UPDATED", {
            bid: updatedBid
        });

        return res.status(200).json({
            success: true,
            message: "Bid updated successfully",
            data: updatedBid
        });
    } catch (error: any) {
        console.error("Update bid error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to update bid"
        });
    }
};

/**
 * @desc Get all bids for a ride (for rider to view)
 * @route GET /api/v1/bids/:rideId
 * @access Private (Rider)
 */
export const getRideBids = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);
        const bids = await biddingService.getRideBids(rideId);

        return res.status(200).json({
            success: true,
            data: bids
        });
    } catch (error: any) {
        console.error("Get bids error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to fetch bids"
        });
    }
};

/**
 * @desc Rider selects a bid (accepts captain)
 * @route POST /api/v1/bids/:rideId/select/:bidId
 * @access Private (Rider)
 */
export const selectBid = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);
        const bidId = parseInt(req.params.bidId);
        const riderId = (req as any).user?.userId;

        const result = await biddingService.selectBid(rideId, bidId, riderId);

        // Notify all watchers that bidding is complete
        const io = getIo();
        io.to(`ride_bids_${rideId}`).emit("BID_SELECTED", {
            rideId,
            selectedBidId: bidId,
            captain: result.captain
        });

        return res.status(200).json({
            success: true,
            message: "Captain selected successfully",
            data: result
        });
    } catch (error: any) {
        console.error("Select bid error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to select bid"
        });
    }
};

/**
 * @desc Captain withdraws their bid
 * @route DELETE /api/v1/bids/:rideId
 * @access Private (Captain)
 */
export const withdrawBid = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rideId = parseInt(req.params.rideId);
        const captainId = (req as any).captainProfile?.id;

        if (!captainId) {
            return res.status(400).json({
                success: false,
                message: "Captain profile not found"
            });
        }

        await biddingService.withdrawBid(rideId, captainId);

        // Notify rider
        const io = getIo();
        io.to(`ride_bids_${rideId}`).emit("BID_WITHDRAWN", {
            rideId,
            captainId
        });

        return res.status(200).json({
            success: true,
            message: "Bid withdrawn successfully"
        });
    } catch (error: any) {
        console.error("Withdraw bid error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to withdraw bid"
        });
    }
};
