import prisma from '../config/prisma';
import redis from '../config/redis';
import { sendNotification, getIo } from '../config/socket';
import { getDistanceAndDuration, getRouteForWaypoints } from './mapService';

/**
 * Ride Sharing Service - Handles Pool/Shared ride matching
 * 
 * The matching algorithm:
 * 1. When rider requests SHARED ride, search for ongoing shared rides
 * 2. Check if new pickup/dropoff are within acceptable detour from existing route
 * 3. Calculate fare discount for both riders
 * 4. Link new ride to parent ride
 */

const MAX_DETOUR_KM = 2; // Maximum acceptable detour in km
const MAX_DETOUR_MINUTES = 10; // Maximum acceptable time detour
const SHARING_DISCOUNT = 0.4; // 40% discount for shared rides
const MAX_SEATS_PER_RIDE = 3; // Maximum passengers in a shared ride

interface SharedRideMatch {
    parentRideId: number;
    captainId: number;
    captainName: string;
    originalRoute: {
        pickupLat: number;
        pickupLng: number;
        dropoffLat: number;
        dropoffLng: number;
    };
    detourKm: number;
    detourMinutes: number;
    routeGeometry?: any;
    confidence?: number; // 0..1
    discountedFare: number;
    estimatedArrival: number;
}

/**
 * Find matching shared rides for a new rider
 */
export const findSharedRideMatch = async (
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleType: 'CAR' | 'AUTO'
): Promise<SharedRideMatch | null> => {
    // Get ongoing shared rides with available seats
    const ongoingSharedRides = await prisma.ride.findMany({
        where: {
            rideType: 'SHARED',
            status: { in: ['ACCEPTED', 'ARRIVED', 'ONGOING'] },
            availableSeats: { gt: 0 },
            vehicleType: vehicleType,
            parentRideId: null // Only match with parent rides, not child rides
        },
        include: {
            captain: {
                select: {
                    id: true,
                    lastLat: true,
                    lastLng: true,
                    user: { select: { fullName: true } }
                }
            }
        }
    });

    if (ongoingSharedRides.length === 0) {
        return null;
    }

    // Check each ride for route compatibility
    for (const ride of ongoingSharedRides) {
        if (!ride.captain || !ride.captain.lastLat || !ride.captain.lastLng) {
            continue;
        }

        // DIRECTIONALITY CHECK: Ensure new pickup is "ahead" on the route, not behind
        // Calculate if new pickup is in the same general direction as the existing dropoff
        const isPickupAhead = await isPointAheadOnRoute(
            ride.captain.lastLat,
            ride.captain.lastLng,
            ride.dropoffLat,
            ride.dropoffLng,
            pickupLat,
            pickupLng
        );

        if (!isPickupAhead) {
            // New pickup would require going backwards - skip this ride
            continue;
        }

        // DIRECTIONALITY CHECK: Ensure new dropoff is in the same general direction
        const isDropoffAhead = await isPointAheadOnRoute(
            pickupLat,
            pickupLng,
            ride.dropoffLat,
            ride.dropoffLng,
            dropoffLat,
            dropoffLng
        );

        if (!isDropoffAhead) {
            // New dropoff would require going backwards after pickup - skip
            continue;
        }

        // Calculate detour if we add this new pickup/dropoff
        const detourResult = await calculateDetour(
            ride.captain.lastLat,
            ride.captain.lastLng,
            ride.dropoffLat,
            ride.dropoffLng,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng
        );

        if (!detourResult) continue;

        // Check if detour is acceptable
        if (detourResult.extraKm <= MAX_DETOUR_KM && detourResult.extraMinutes <= MAX_DETOUR_MINUTES) {
            // Calculate discounted fare for new rider
            const directResult = await getDistanceAndDuration(
                [pickupLat, pickupLng],
                [dropoffLat, dropoffLng]
            );

            if (!directResult) continue;

            const baseFare = calculateBaseFare(directResult.distanceKm, directResult.durationMinutes, vehicleType);
            const discountedFare = baseFare * (1 - SHARING_DISCOUNT);

            return {
                parentRideId: ride.id,
                captainId: ride.captain.id,
                captainName: ride.captain.user.fullName,
                originalRoute: {
                    pickupLat: ride.pickupLat,
                    pickupLng: ride.pickupLng,
                    dropoffLat: ride.dropoffLat,
                    dropoffLng: ride.dropoffLng
                },
                detourKm: detourResult.extraKm,
                detourMinutes: detourResult.extraMinutes,
                routeGeometry: detourResult.geometry,
                confidence: detourResult.confidence,
                discountedFare: parseFloat(discountedFare.toFixed(2)),
                estimatedArrival: detourResult.pickupEta
            };
        }
    }

    return null;
};

/**
 * Join an existing shared ride
 */
export const joinSharedRide = async (
    parentRideId: number,
    riderId: number,
    pickupAddress: string,
    pickupLat: number,
    pickupLng: number,
    dropoffAddress: string,
    dropoffLat: number,
    dropoffLng: number,
    fare: number,
    vehicleType: 'CAR' | 'AUTO'
): Promise<any> => {
    // Perform atomic seat decrement and child ride creation inside a transaction
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const txResult = await prisma.$transaction(async (tx) => {
        // Attempt to decrement available seats only if seats are > 0
        const updateResult = await tx.ride.updateMany({
            where: { id: parentRideId, availableSeats: { gt: 0 } },
            data: { availableSeats: { decrement: 1 } }
        });

        if (updateResult.count === 0) {
            throw new Error('Shared ride is no longer available');
        }

        // Re-fetch parent to get captain/rider info
        const parent = await tx.ride.findUnique({
            where: { id: parentRideId },
            select: {
                id: true,
                captainId: true,
                availableSeats: true,
                fare: true,
                captain: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
                rider: { select: { id: true, fullName: true } }
            }
        });

        if (!parent) {
            throw new Error('Parent ride not found');
        }

        // Create the child ride linked to parent (use parent's captainId)
        const childRide = await tx.ride.create({
            data: {
                riderId,
                captainId: parent.captainId,
                pickupAddress,
                pickupLat,
                pickupLng,
                dropoffAddress,
                dropoffLat,
                dropoffLng,
                vehicleType,
                rideType: 'SHARED',
                parentRideId: parentRideId,
                status: 'ACCEPTED',
                fare,
                sharingDiscount: SHARING_DISCOUNT * 100, // Store as percentage
                otp
            },
            include: {
                captain: {
                    select: {
                        id: true,
                        lastLat: true,
                        lastLng: true,
                        vehicleNumber: true,
                        vehicleModel: true,
                        vehicleColor: true,
                        rating: true,
                        user: { select: { fullName: true } }
                    }
                }
            }
        });

        // Re-fetch parent ride to get fare, captain and rider info for notifications
        const parentAfter = await tx.ride.findUnique({
            where: { id: parentRideId },
            select: {
                id: true,
                captainId: true,
                availableSeats: true,
                fare: true,
                captain: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
                rider: { select: { id: true, fullName: true } }
            }
        });

        const originalFare = parentAfter?.fare || 0;
        const discountedOriginalFare = originalFare * (1 - SHARING_DISCOUNT / 2); // 20% discount for original rider

        await tx.ride.update({
            where: { id: parentRideId },
            data: {
                fare: parseFloat(discountedOriginalFare.toFixed(2)),
                sharingDiscount: (SHARING_DISCOUNT / 2) * 100
            }
        });

        return { childRide, parentAfter, originalFare, discountedOriginalFare };
    });

    const childRide = txResult.childRide;
    const parentRide = txResult.parentAfter;
    const originalFare = txResult.originalFare;
    const discountedOriginalFare = txResult.discountedOriginalFare;

    if (!parentRide) {
        throw new Error('Parent ride data missing after transaction');
    }

    // Real-time socket emits + notifications
    try {
        const io = getIo();

        // Emit update to parent ride room so UIs can refresh passenger list/fare
        io.to(`ride_${parentRideId}`).emit('SHARED_RIDE_UPDATED', {
            parentRideId,
            availableSeats: parentRide.availableSeats,
            newPassenger: {
                rideId: childRide.id,
                pickup: { address: pickupAddress, lat: pickupLat, lng: pickupLng },
                dropoff: { address: dropoffAddress, lat: dropoffLat, lng: dropoffLng }
            },
            newFareForOriginal: parseFloat(discountedOriginalFare.toFixed(2))
        });

        // Emit specific event to the child ride room (new passenger joined)
        io.to(`ride_${childRide.id}`).emit('JOINED_SHARED_RIDE', {
            rideId: childRide.id,
            parentRideId,
            otp,
            pickup: { address: pickupAddress, lat: pickupLat, lng: pickupLng },
            dropoff: { address: dropoffAddress, lat: dropoffLat, lng: dropoffLng },
            fare
        });
    } catch (err) {
        console.error('Socket emit error for shared ride join:', err);
    }

    // Notify captain about new passenger
    if (parentRide.captain) {
        sendNotification(parentRide.captain.userId, 'SHARED_RIDE_PASSENGER_ADDED', {
            rideId: childRide.id,
            parentRideId,
            message: 'A new passenger is joining your shared ride!',
            newPassenger: {
                pickup: { address: pickupAddress, lat: pickupLat, lng: pickupLng },
                dropoff: { address: dropoffAddress, lat: dropoffLat, lng: dropoffLng },
                otp
            }
        });
    }

    // Notify original rider about fare reduction
    const originalRiderId = parentRide.rider?.id;
    if (originalRiderId) {
        sendNotification(originalRiderId, 'SHARED_RIDE_FARE_REDUCED', {
            rideId: parentRideId,
            message: 'Another passenger is joining! Your fare has been reduced.',
            originalFare,
            newFare: parseFloat(discountedOriginalFare.toFixed(2)),
            savings: parseFloat((originalFare - discountedOriginalFare).toFixed(2))
        });
    }

    return {
        ride: childRide,
        otp,
        parentRideId,
        sharingDiscount: SHARING_DISCOUNT * 100
    };
};

/**
 * Get all passengers in a shared ride group
 */
export const getSharedRidePassengers = async (rideId: number): Promise<any[]> => {
    // First check if this is a parent or child ride
    const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { parentRideId: true }
    });

    const parentId = ride?.parentRideId || rideId;

    // Get parent ride
    const parentRide = await prisma.ride.findUnique({
        where: { id: parentId },
        include: {
            rider: { select: { id: true, fullName: true } },
            sharedRides: {
                include: {
                    rider: { select: { id: true, fullName: true } }
                }
            }
        }
    });

    if (!parentRide) return [];

    const passengers = [
        {
            rideId: parentRide.id,
            riderId: parentRide.rider.id,
            riderName: parentRide.rider.fullName,
            isOriginal: true,
            pickup: {
                address: parentRide.pickupAddress,
                lat: parentRide.pickupLat,
                lng: parentRide.pickupLng
            },
            dropoff: {
                address: parentRide.dropoffAddress,
                lat: parentRide.dropoffLat,
                lng: parentRide.dropoffLng
            },
            status: parentRide.status
        }
    ];

    for (const childRide of parentRide.sharedRides) {
        passengers.push({
            rideId: childRide.id,
            riderId: childRide.rider.id,
            riderName: childRide.rider.fullName,
            isOriginal: false,
            pickup: {
                address: childRide.pickupAddress,
                lat: childRide.pickupLat,
                lng: childRide.pickupLng
            },
            dropoff: {
                address: childRide.dropoffAddress,
                lat: childRide.dropoffLat,
                lng: childRide.dropoffLng
            },
            status: childRide.status
        });
    }

    return passengers;
};

/**
 * Initialize a ride as shareable
 */
export const initializeSharedRide = async (rideId: number): Promise<void> => {
    await prisma.ride.update({
        where: { id: rideId },
        data: {
            rideType: 'SHARED',
            availableSeats: MAX_SEATS_PER_RIDE - 1 // One seat taken by original rider
        }
    });
};

// Helper functions

/**
 * Check if a point is "ahead" on the route (in the same general direction)
 * Uses vector dot product to determine if the point is in the forward direction
 */
async function isPointAheadOnRoute(
    currentLat: number,
    currentLng: number,
    destinationLat: number,
    destinationLng: number,
    checkPointLat: number,
    checkPointLng: number
): Promise<boolean> {
    // Vector from current position to destination
    const toDestVectorLat = destinationLat - currentLat;
    const toDestVectorLng = destinationLng - currentLng;

    // Vector from current position to checkpoint
    const toCheckVectorLat = checkPointLat - currentLat;
    const toCheckVectorLng = checkPointLng - currentLng;

    // Dot product: positive means same general direction
    const dotProduct = (toDestVectorLat * toCheckVectorLat) + (toDestVectorLng * toCheckVectorLng);

    // If dot product is negative, the checkpoint is behind us (wrong direction)
    if (dotProduct < 0) {
        return false;
    }

    // Calculate the angle between vectors using normalized dot product
    const destMagnitude = Math.sqrt(toDestVectorLat ** 2 + toDestVectorLng ** 2);
    const checkMagnitude = Math.sqrt(toCheckVectorLat ** 2 + toCheckVectorLng ** 2);

    if (destMagnitude === 0 || checkMagnitude === 0) {
        return true; // Edge case: same point
    }

    const cosAngle = dotProduct / (destMagnitude * checkMagnitude);
    
    // Allow up to ~60 degree deviation from the direct route (cos(60°) ≈ 0.5)
    // This ensures we don't match rides that would require significant backtracking
    return cosAngle >= 0.5;
}

async function calculateDetour(
    currentLat: number,
    currentLng: number,
    originalDropoffLat: number,
    originalDropoffLng: number,
    newPickupLat: number,
    newPickupLng: number,
    newDropoffLat: number,
    newDropoffLng: number
): Promise<{ extraKm: number; extraMinutes: number; pickupEta: number; geometry?: any; confidence?: number } | null> {
    try {
        // Use route-for-waypoints to evaluate multiple insertion orders and pick best
        const originalRoute = await getRouteForWaypoints([
            [currentLat, currentLng],
            [originalDropoffLat, originalDropoffLng]
        ]);

        if (!originalRoute) return null;

        // Candidate sequences to evaluate
        const seqA: [number, number][] = [
            [currentLat, currentLng],
            [newPickupLat, newPickupLng],
            [originalDropoffLat, originalDropoffLng],
            [newDropoffLat, newDropoffLng]
        ];

        const seqB: [number, number][] = [
            [currentLat, currentLng],
            [newPickupLat, newPickupLng],
            [newDropoffLat, newDropoffLng],
            [originalDropoffLat, originalDropoffLng]
        ];

        const candidates: [number, number][][] = [seqA, seqB];
        let best: { distanceKm: number; durationMinutes: number; geometry: any; seqIndex: number } | null = null;

        for (let i = 0; i < candidates.length; i++) {
            const route = await getRouteForWaypoints(candidates[i]);
            if (!route) continue;
            if (!best || route.distanceKm < best.distanceKm) {
                best = { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes, geometry: route.geometry, seqIndex: i };
            }
        }

        if (!best) return null;

        const extraKm = Math.max(0, best.distanceKm - originalRoute.distanceKm);
        const extraMinutes = Math.max(0, best.durationMinutes - originalRoute.durationMinutes);

        // ETA to pickup: compute direct leg current -> newPickup
        const toNewPickup = await getRouteForWaypoints([
            [currentLat, currentLng],
            [newPickupLat, newPickupLng]
        ]);

        const pickupEta = toNewPickup ? Math.round(toNewPickup.durationMinutes) : 0;

        // Confidence score: normalized by thresholds, clamped 0..1 (higher is better)
        const kmFactor = extraKm / (MAX_DETOUR_KM || 1);
        const minFactor = extraMinutes / (MAX_DETOUR_MINUTES || 1);
        let confidence = 1 - (kmFactor + minFactor);
        if (confidence < 0) confidence = 0;
        if (confidence > 1) confidence = 1;

        return {
            extraKm: parseFloat(extraKm.toFixed(3)),
            extraMinutes: Math.round(extraMinutes),
            pickupEta,
            geometry: best.geometry,
            confidence
        } as any;
    } catch (error) {
        console.error('Error calculating detour:', error);
        return null;
    }
}

function calculateBaseFare(distanceKm: number, durationMinutes: number, vehicleType: 'CAR' | 'AUTO'): number {
    const rates = {
        CAR: { base: 50, perKm: 12, perMin: 2 },
        AUTO: { base: 30, perKm: 8, perMin: 1.5 }
    };

    const rate = rates[vehicleType];
    return rate.base + (distanceKm * rate.perKm) + (durationMinutes * rate.perMin);
}
