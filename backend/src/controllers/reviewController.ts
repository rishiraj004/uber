import { Response } from "express";
import prisma from "../config/prisma.js";
import { AuthRequest } from "../middlewares/authMiddlewares.js";

export const submitReview = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId, rating, comment, type } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId || !rating || !type) {
            return res.status(400).json({ message: "Ride ID, rating, and type are required." });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Rating must be between 1 and 5." });
        }

        if (type !== "RIDER_TO_CAPTAIN" && type !== "CAPTAIN_TO_RIDER") {
            return res.status(400).json({ message: "Invalid review type." });
        }

        const ride = await prisma.ride.findUnique({
            where: { id: Number(rideId) },
            include: {
                rider: true,
                captain: {
                    include: {
                        user: true
                    }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found." });
        }

        if (ride.status !== "COMPLETED") {
            return res.status(400).json({ message: "Can only review completed rides." });
        }

        let reviewerId: number;
        let revieweeId: number;

        if (type === "RIDER_TO_CAPTAIN") {
            if (ride.riderId !== userId) {
                return res.status(403).json({ message: "You are not the rider of this ride." });
            }
            if (!ride.captain) {
                return res.status(400).json({ message: "This ride has no captain assigned." });
            }
            reviewerId = userId;
            revieweeId = ride.captain.userId;
        } else {
            if (!ride.captain || ride.captain.userId !== userId) {
                return res.status(403).json({ message: "You are not the captain of this ride." });
            }
            reviewerId = userId;
            revieweeId = ride.riderId;
        }

        const existingReview = await prisma.review.findFirst({
            where: {
                rideId: Number(rideId),
                reviewerId: reviewerId,
                type: type
            }
        });

        if (existingReview) {
            return res.status(400).json({ message: "You have already reviewed this ride." });
        }

        const review = await prisma.review.create({
            data: {
                rideId: Number(rideId),
                reviewerId,
                revieweeId,
                rating: Number(rating),
                comment: comment || null,
                type
            }
        });

        await updateAverageRating(revieweeId, type);

        if (type === "RIDER_TO_CAPTAIN") {
            await prisma.captainProfile.update({
                where: { userId: revieweeId },
                data: { totalRides: { increment: 1 } }
            });
        } else {
            await prisma.riderProfile.update({
                where: { userId: revieweeId },
                data: { totalRides: { increment: 1 } }
            });
        }

        res.status(201).json({
            message: "Review submitted successfully",
            review
        });
    } catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Helper to recalculate and update average rating
 */
async function updateAverageRating(revieweeId: number, reviewType: string) {
    // Fetch all reviews received by this user
    const reviews = await prisma.review.findMany({
        where: { revieweeId },
        select: { rating: true }
    });

    if (reviews.length === 0) return;

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / reviews.length;

    // Update the appropriate profile based on review type
    if (reviewType === "RIDER_TO_CAPTAIN") {
        // Update CaptainProfile rating
        await prisma.captainProfile.update({
            where: { userId: revieweeId },
            data: { rating: parseFloat(averageRating.toFixed(2)) }
        });
    } else {
        // Update RiderProfile rating
        await prisma.riderProfile.update({
            where: { userId: revieweeId },
            data: { rating: parseFloat(averageRating.toFixed(2)) }
        });
    }
}

/**
 * Get reviews for a specific user
 */
export const getReviewsForUser = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required." });
        }

        const reviews = await prisma.review.findMany({
            where: { revieweeId: Number(userId) },
            include: {
                reviewer: {
                    select: {
                        id: true,
                        fullName: true
                    }
                },
                ride: {
                    select: {
                        id: true,
                        pickupAddress: true,
                        dropoffAddress: true,
                        completedAt: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({ reviews });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Check if user has already reviewed a specific ride
 */
export const checkReviewStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required." });
        }

        const existingReview = await prisma.review.findFirst({
            where: {
                rideId: Number(rideId),
                reviewerId: userId
            }
        });

        res.status(200).json({
            hasReviewed: !!existingReview,
            review: existingReview
        });
    } catch (error) {
        console.error("Error checking review status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
