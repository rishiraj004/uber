import prisma from '../config/prisma';
import redis from '../config/redis';
import { sendNotification } from '../config/socket';
import { getDistanceAndDuration } from './mapService';

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
    // Get parent ride
    const parentRide = await prisma.ride.findUnique({
        where: { id: parentRideId },
        include: {
            captain: {
                select: {
                    id: true,
                    userId: true,
                    user: { select: { fullName: true } }
                }
            },
            rider: { select: { id: true, fullName: true } }
        }
    });

    if (!parentRide || parentRide.availableSeats <= 0) {
        throw new Error('Shared ride is no longer available');
    }

    // Create linked child ride
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const [childRide, _] = await prisma.$transaction([
        // Create new ride linked to parent
        prisma.ride.create({
            data: {
                riderId,
                captainId: parentRide.captainId,
                pickupAddress,
                pickupLat,
                pickupLng,
                dropoffAddress,
                dropoffLat,
                dropoffLng,
                vehicleType,
                rideType: 'SHARED',
                parentRideId: parentRide.id,
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
        }),
        // Decrement available seats on parent ride
        prisma.ride.update({
            where: { id: parentRideId },
            data: {
                availableSeats: { decrement: 1 }
            }
        })
    ]);

    // Apply discount to original rider too
    const originalFare = parentRide.fare || 0;
    const discountedOriginalFare = originalFare * (1 - SHARING_DISCOUNT / 2); // 20% discount for original rider

    await prisma.ride.update({
        where: { id: parentRideId },
        data: {
            fare: parseFloat(discountedOriginalFare.toFixed(2)),
            sharingDiscount: (SHARING_DISCOUNT / 2) * 100
        }
    });

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
    sendNotification(parentRide.riderId, 'SHARED_RIDE_FARE_REDUCED', {
        rideId: parentRideId,
        message: 'Another passenger is joining! Your fare has been reduced.',
        originalFare,
        newFare: parseFloat(discountedOriginalFare.toFixed(2)),
        savings: parseFloat((originalFare - discountedOriginalFare).toFixed(2))
    });

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

async function calculateDetour(
    currentLat: number,
    currentLng: number,
    originalDropoffLat: number,
    originalDropoffLng: number,
    newPickupLat: number,
    newPickupLng: number,
    newDropoffLat: number,
    newDropoffLng: number
): Promise<{ extraKm: number; extraMinutes: number; pickupEta: number } | null> {
    try {
        // Original route: current -> original dropoff
        const originalRoute = await getDistanceAndDuration(
            [currentLat, currentLng],
            [originalDropoffLat, originalDropoffLng]
        );

        // New route: current -> new pickup -> original dropoff -> new dropoff
        // (or optimized order based on positions)
        const toNewPickup = await getDistanceAndDuration(
            [currentLat, currentLng],
            [newPickupLat, newPickupLng]
        );

        const toOriginalDropoff = await getDistanceAndDuration(
            [newPickupLat, newPickupLng],
            [originalDropoffLat, originalDropoffLng]
        );

        const toNewDropoff = await getDistanceAndDuration(
            [originalDropoffLat, originalDropoffLng],
            [newDropoffLat, newDropoffLng]
        );

        if (!originalRoute || !toNewPickup || !toOriginalDropoff || !toNewDropoff) {
            return null;
        }

        const newTotalKm = toNewPickup.distanceKm + toOriginalDropoff.distanceKm + toNewDropoff.distanceKm;
        const newTotalMinutes = toNewPickup.durationMinutes + toOriginalDropoff.durationMinutes + toNewDropoff.durationMinutes;

        // Calculate only the extra distance/time (excluding final leg to new dropoff)
        const extraKm = (toNewPickup.distanceKm + toOriginalDropoff.distanceKm) - originalRoute.distanceKm;
        const extraMinutes = (toNewPickup.durationMinutes + toOriginalDropoff.durationMinutes) - originalRoute.durationMinutes;

        return {
            extraKm: Math.max(0, extraKm),
            extraMinutes: Math.max(0, extraMinutes),
            pickupEta: Math.round(toNewPickup.durationMinutes)
        };
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
