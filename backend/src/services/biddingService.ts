import prisma from '../config/prisma';
import redis from '../config/redis';
import { sendNotification } from '../config/socket';
import { BidStatus } from '@prisma/client';

/**
 * Bidding Service - Handles negotiation mode (like InDrive)
 * 
 * Flow:
 * 1. Rider creates ride with baseOfferPrice and isBiddingEnabled=true
 * 2. Nearby captains receive the request and can:
 *    - Accept the offer (creates bid with status ACCEPTED)
 *    - Counter-offer with higher price (creates bid with status COUNTERED)
 * 3. Rider sees all bids with captain info, ratings, and counter-offers
 * 4. Rider selects preferred captain -> bid status becomes SELECTED
 * 5. Ride proceeds normally with the selected captain
 */

const BID_EXPIRY_SECONDS = 300; // 5 minutes for bids to expire

/**
 * Create a bid from captain (accept or counter-offer)
 */
export const createBid = async (
    rideId: number,
    captainId: number,
    offerAmount: number,
    estimatedArrival?: number
): Promise<{ bid: any; isAcceptingRiderPrice: boolean }> => {
    // Get ride details
    const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: {
            id: true,
            status: true,
            isBiddingEnabled: true,
            baseOfferPrice: true,
            riderId: true
        }
    });

    if (!ride) {
        throw new Error('Ride not found');
    }

    if (!ride.isBiddingEnabled) {
        throw new Error('Bidding is not enabled for this ride');
    }

    if (ride.status !== 'PENDING') {
        throw new Error('Ride is no longer accepting bids');
    }

    // Check if captain already placed a bid
    const existingBid = await prisma.rideBid.findUnique({
        where: {
            rideId_captainId: { rideId, captainId }
        }
    });

    if (existingBid) {
        throw new Error('You have already placed a bid on this ride');
    }

    // Determine bid status
    const isAcceptingRiderPrice = offerAmount === ride.baseOfferPrice;
    const status: BidStatus = isAcceptingRiderPrice ? 'ACCEPTED' : 'COUNTERED';

    // Create bid
    const bid = await prisma.rideBid.create({
        data: {
            rideId,
            captainId,
            offerAmount,
            estimatedArrival,
            status
        },
        include: {
            captain: {
                select: {
                    id: true,
                    rating: true,
                    totalRides: true,
                    vehicleNumber: true,
                    vehicleModel: true,
                    vehicleColor: true,
                    vehicleType: true,
                    user: {
                        select: {
                            fullName: true
                        }
                    }
                }
            }
        }
    });

    // Store bid in Redis for quick access with TTL
    await redis.setex(
        `bid:${rideId}:${captainId}`,
        BID_EXPIRY_SECONDS,
        JSON.stringify({
            bidId: bid.id,
            captainId,
            offerAmount,
            status,
            estimatedArrival
        })
    );

    // Add to ride's bid list in Redis
    await redis.sadd(`ride_bids:${rideId}`, captainId.toString());
    await redis.expire(`ride_bids:${rideId}`, BID_EXPIRY_SECONDS);

    // Notify rider about new bid
    sendNotification(ride.riderId, 'NEW_BID_RECEIVED', {
        rideId,
        bid: {
            id: bid.id,
            captainId: bid.captainId,
            captainName: bid.captain.user.fullName,
            captainRating: bid.captain.rating,
            totalRides: bid.captain.totalRides,
            vehicleNumber: bid.captain.vehicleNumber,
            vehicleModel: bid.captain.vehicleModel,
            vehicleColor: bid.captain.vehicleColor,
            vehicleType: bid.captain.vehicleType,
            offerAmount: bid.offerAmount,
            estimatedArrival: bid.estimatedArrival,
            status: bid.status,
            isAcceptingRiderPrice
        }
    });

    return { bid, isAcceptingRiderPrice };
};

/**
 * Update captain's bid (change counter-offer)
 */
export const updateBid = async (
    rideId: number,
    captainId: number,
    newOfferAmount: number
): Promise<any> => {
    const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { status: true, isBiddingEnabled: true, baseOfferPrice: true, riderId: true }
    });

    if (!ride || ride.status !== 'PENDING' || !ride.isBiddingEnabled) {
        throw new Error('Cannot update bid for this ride');
    }

    const isAcceptingRiderPrice = newOfferAmount === ride.baseOfferPrice;
    const status: BidStatus = isAcceptingRiderPrice ? 'ACCEPTED' : 'COUNTERED';

    const bid = await prisma.rideBid.update({
        where: {
            rideId_captainId: { rideId, captainId }
        },
        data: {
            offerAmount: newOfferAmount,
            status
        },
        include: {
            captain: {
                select: {
                    rating: true,
                    user: { select: { fullName: true } }
                }
            }
        }
    });

    // Update Redis
    await redis.setex(
        `bid:${rideId}:${captainId}`,
        BID_EXPIRY_SECONDS,
        JSON.stringify({
            bidId: bid.id,
            captainId,
            offerAmount: newOfferAmount,
            status
        })
    );

    // Notify rider
    sendNotification(ride.riderId, 'BID_UPDATED', {
        rideId,
        captainId,
        captainName: bid.captain.user.fullName,
        newOfferAmount,
        status
    });

    return bid;
};

/**
 * Get all bids for a ride (for rider to view)
 */
export const getRideBids = async (rideId: number): Promise<any[]> => {
    const bids = await prisma.rideBid.findMany({
        where: {
            rideId,
            status: { in: ['ACCEPTED', 'COUNTERED'] }
        },
        include: {
            captain: {
                select: {
                    id: true,
                    rating: true,
                    totalRides: true,
                    vehicleNumber: true,
                    vehicleModel: true,
                    vehicleColor: true,
                    vehicleType: true,
                    lastLat: true,
                    lastLng: true,
                    user: {
                        select: {
                            fullName: true
                        }
                    }
                }
            }
        },
        orderBy: [
            { offerAmount: 'asc' }, // Lowest price first
            { captain: { rating: 'desc' } } // Then by rating
        ]
    });

    return bids.map(bid => ({
        id: bid.id,
        captainId: bid.captainId,
        captainName: bid.captain.user.fullName,
        captainRating: bid.captain.rating,
        totalRides: bid.captain.totalRides,
        vehicleNumber: bid.captain.vehicleNumber,
        vehicleModel: bid.captain.vehicleModel,
        vehicleColor: bid.captain.vehicleColor,
        vehicleType: bid.captain.vehicleType,
        captainLocation: bid.captain.lastLat && bid.captain.lastLng ? {
            lat: bid.captain.lastLat,
            lng: bid.captain.lastLng
        } : null,
        offerAmount: bid.offerAmount,
        estimatedArrival: bid.estimatedArrival,
        status: bid.status,
        createdAt: bid.createdAt
    }));
};

/**
 * Rider selects a bid - assigns captain to ride
 * Uses optimistic locking to prevent race conditions when multiple captains
 * might be selected simultaneously
 */
export const selectBid = async (rideId: number, bidId: number, riderId: number): Promise<any> => {
    // Use a transaction with proper isolation to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
        // Re-fetch ride with lock (using findFirst with a write operation intent)
        const ride = await tx.ride.findUnique({
            where: { id: rideId },
            select: { riderId: true, status: true, isBiddingEnabled: true, captainId: true }
        });

        if (!ride) {
            throw new Error('Ride not found');
        }

        if (ride.riderId !== riderId) {
            throw new Error('Unauthorized');
        }

        // RACE CONDITION FIX: Check status inside transaction
        if (ride.status !== 'PENDING') {
            throw new Error('Ride is no longer available - another bid may have been selected');
        }

        // Also check if captain already assigned (belt and suspenders)
        if (ride.captainId) {
            throw new Error('A captain has already been assigned to this ride');
        }

        // Get the selected bid
        const selectedBid = await tx.rideBid.findUnique({
            where: { id: bidId },
            include: {
                captain: {
                    select: {
                        id: true,
                        userId: true,
                        rating: true,
                        vehicleNumber: true,
                        vehicleModel: true,
                        vehicleColor: true,
                        vehicleType: true,
                        isAvailable: true,
                        user: { select: { fullName: true } }
                    }
                }
            }
        });

        if (!selectedBid || selectedBid.rideId !== rideId) {
            throw new Error('Invalid bid');
        }

        // Allow selecting bids that are ACCEPTED or COUNTERED.
        // Only reject bids that are already REJECTED or already SELECTED.
        if (selectedBid.status === 'REJECTED' || selectedBid.status === 'SELECTED') {
            throw new Error('This bid is no longer available');
        }

        // Check if captain is still available
        if (!selectedBid.captain.isAvailable) {
            throw new Error('This captain is no longer available');
        }

        // Generate OTP for ride
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // Mark selected bid as SELECTED
        await tx.rideBid.update({
            where: { id: bidId },
            data: { status: 'SELECTED' }
        });

        // Reject all other bids
        await tx.rideBid.updateMany({
            where: {
                rideId,
                id: { not: bidId }
            },
            data: { status: 'REJECTED' }
        });

        // Mark captain as unavailable
        await tx.captainProfile.update({
            where: { id: selectedBid.captainId },
            data: { isAvailable: false }
        });

        // Update ride
        const updatedRide = await tx.ride.update({
            where: { id: rideId },
            data: {
                captainId: selectedBid.captainId,
                finalAgreedPrice: selectedBid.offerAmount,
                fare: selectedBid.offerAmount,
                status: 'ACCEPTED',
                otp
            },
            include: {
                captain: {
                    select: {
                        id: true,
                        rating: true,
                        lastLat: true,
                        lastLng: true,
                        vehicleNumber: true,
                        vehicleModel: true,
                        vehicleColor: true,
                        user: { select: { fullName: true } }
                    }
                }
            }
        });

        return { updatedRide, selectedBid };
    }, {
        // Use serializable isolation to prevent concurrent modifications
        isolationLevel: 'Serializable'
    });

    // Notify selected captain (outside transaction)
    sendNotification(result.selectedBid.captain.userId, 'BID_SELECTED', {
        rideId,
        message: 'Your bid has been accepted! Navigate to pickup.',
        otp: result.updatedRide.otp,
        pickup: {
            address: result.updatedRide.pickupAddress,
            lat: result.updatedRide.pickupLat,
            lng: result.updatedRide.pickupLng
        },
        dropoff: {
            address: result.updatedRide.dropoffAddress,
            lat: result.updatedRide.dropoffLat,
            lng: result.updatedRide.dropoffLng
        },
        fare: result.selectedBid.offerAmount
    });

    // Notify other captains that their bids were rejected
    const rejectedBids = await prisma.rideBid.findMany({
        where: { rideId, status: 'REJECTED' },
        include: { captain: { select: { userId: true } } }
    });

    for (const bid of rejectedBids) {
        sendNotification(bid.captain.userId, 'BID_REJECTED', {
            rideId,
            message: 'The rider chose another captain for this trip.'
        });
    }

    // Cleanup Redis: collect captain IDs first, delete individual bid keys, then remove the set
    const captainIds = await redis.smembers(`ride_bids:${rideId}`);
    for (const captainId of captainIds) {
        await redis.del(`bid:${rideId}:${captainId}`);
    }
    await redis.del(`ride_bids:${rideId}`);

    return {
        ride: result.updatedRide,
        agreedPrice: result.selectedBid.offerAmount,
        captain: {
            id: result.selectedBid.captain.id,
            name: result.selectedBid.captain.user.fullName,
            rating: result.selectedBid.captain.rating,
            vehicleNumber: result.selectedBid.captain.vehicleNumber,
            vehicleModel: result.selectedBid.captain.vehicleModel,
            vehicleColor: result.selectedBid.captain.vehicleColor
        },
        otp: result.updatedRide.otp
    };
};

/**
 * Cancel/withdraw a bid
 */
export const withdrawBid = async (rideId: number, captainId: number): Promise<void> => {
    await prisma.rideBid.delete({
        where: {
            rideId_captainId: { rideId, captainId }
        }
    });

    // Cleanup Redis
    await redis.del(`bid:${rideId}:${captainId}`);
    await redis.srem(`ride_bids:${rideId}`, captainId.toString());

    // Notify rider
    const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { riderId: true }
    });

    if (ride) {
        sendNotification(ride.riderId, 'BID_WITHDRAWN', {
            rideId,
            captainId
        });
    }
};

/**
 * Cleanup stale bids (called by cron job)
 * Removes bids for rides that are no longer pending
 */
export const cleanupStaleBids = async (): Promise<{
    cleanedBids: number;
    cleanedRides: number;
}> => {
    // Find bids for rides that are no longer pending
    const staleBids = await prisma.rideBid.findMany({
        where: {
            ride: {
                status: {
                    notIn: ['PENDING']
                }
            },
            status: 'PENDING'
        },
        select: {
            id: true,
            rideId: true,
            captainId: true
        }
    });

    // Delete stale bids
    const deleteResult = await prisma.rideBid.deleteMany({
        where: {
            id: { in: staleBids.map(b => b.id) }
        }
    });

    // Clean up Redis entries
    const rideIds = [...new Set(staleBids.map(b => b.rideId))];
    for (const rideId of rideIds) {
        const bidsForRide = staleBids.filter(b => b.rideId === rideId);
        for (const bid of bidsForRide) {
            await redis.del(`bid:${rideId}:${bid.captainId}`);
        }
        await redis.del(`ride_bids:${rideId}`);
    }

    return {
        cleanedBids: deleteResult.count,
        cleanedRides: rideIds.length
    };
};
