import redis from '../config/redis.js';
import prisma from '../config/prisma.js';
import { distanceBetweenPoints } from '../utils/index.js';

/**
 * Surge Pricing Service
 * Calculates dynamic pricing based on demand/supply ratio
 */

// Surge configuration
const SURGE_CONFIG = {
    RADIUS_KM: 5, // Check demand within 5km radius
    MIN_MULTIPLIER: 1.0, // No surge
    MAX_MULTIPLIER: 3.0, // Maximum 3x surge
    CACHE_TTL_SECONDS: 300, // Cache surge for 5 minutes
    THRESHOLDS: [
        { ratio: 1.0, multiplier: 1.0 },  // Equal demand/supply = no surge
        { ratio: 1.5, multiplier: 1.2 },  // 1.5x more rides than captains = 1.2x surge
        { ratio: 2.0, multiplier: 1.5 },  // 2x more rides = 1.5x surge
        { ratio: 2.5, multiplier: 1.8 },  // 2.5x more rides = 1.8x surge
        { ratio: 3.0, multiplier: 2.0 },  // 3x more rides = 2x surge
        { ratio: 4.0, multiplier: 2.5 },  // 4x more rides = 2.5x surge
        { ratio: 5.0, multiplier: 3.0 },  // 5x+ more rides = 3x surge (max)
    ]
};

// Generate cache key for a location grid
const getSurgeGridKey = (lat: number, lng: number): string => {
    // Create grid cells of ~1km for caching
    const gridLat = Math.round(lat * 100) / 100;
    const gridLng = Math.round(lng * 100) / 100;
    return `surge:${gridLat}:${gridLng}`;
};

/**
 * Calculate surge multiplier based on demand/supply in an area
 */
export const calculateSurgeMultiplier = async (lat: number, lng: number): Promise<number> => {
    try {
        const cacheKey = getSurgeGridKey(lat, lng);
        
        // Check cache first
        const cachedSurge = await redis.get(cacheKey);
        if (cachedSurge) {
            return parseFloat(cachedSurge);
        }

        // Count active PENDING rides in the area (demand)
        const pendingRides = await prisma.ride.findMany({
            where: {
                status: 'PENDING',
                createdAt: {
                    gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
                }
            },
            select: {
                pickupLat: true,
                pickupLng: true
            }
        });

        // Filter rides within radius
        const nearbyPendingRides = pendingRides.filter(ride => {
            const distance = distanceBetweenPoints(
                lat, lng,
                ride.pickupLat, ride.pickupLng
            );
            return distance <= SURGE_CONFIG.RADIUS_KM;
        });

        // Count available captains in the area (supply)
        const availableCaptains = await prisma.captainProfile.findMany({
            where: {
                isOnline: true,
                isAvailable: true,
                isVerified: true,
                lastLat: { not: null },
                lastLng: { not: null }
            },
            select: {
                lastLat: true,
                lastLng: true
            }
        });

        // Filter captains within radius
        const nearbyCaptains = availableCaptains.filter(captain => {
            if (!captain.lastLat || !captain.lastLng) return false;
            const distance = distanceBetweenPoints(
                lat, lng,
                captain.lastLat, captain.lastLng
            );
            return distance <= SURGE_CONFIG.RADIUS_KM;
        });

        const demand = nearbyPendingRides.length;
        const supply = nearbyCaptains.length;

        console.log(`Surge calculation at (${lat}, ${lng}): demand=${demand}, supply=${supply}`);

        // Calculate ratio (avoid division by zero)
        let ratio: number;
        if (supply === 0) {
            ratio = demand > 0 ? SURGE_CONFIG.THRESHOLDS[SURGE_CONFIG.THRESHOLDS.length - 1].ratio : 1.0;
        } else {
            ratio = demand / supply;
        }

        // Find appropriate multiplier
        let multiplier = SURGE_CONFIG.MIN_MULTIPLIER;
        for (const threshold of SURGE_CONFIG.THRESHOLDS) {
            if (ratio >= threshold.ratio) {
                multiplier = threshold.multiplier;
            } else {
                break;
            }
        }

        // Clamp to max multiplier
        multiplier = Math.min(multiplier, SURGE_CONFIG.MAX_MULTIPLIER);

        // Cache the result
        await redis.setex(cacheKey, SURGE_CONFIG.CACHE_TTL_SECONDS, multiplier.toString());

        console.log(`Surge multiplier for (${lat}, ${lng}): ${multiplier}x (ratio: ${ratio.toFixed(2)})`);
        return multiplier;
    } catch (error) {
        console.error('Error calculating surge multiplier:', error);
        return SURGE_CONFIG.MIN_MULTIPLIER; // Default to no surge on error
    }
};

/**
 * Apply surge to a base fare
 */
export const applySurge = (baseFare: number, surgeMultiplier: number): number => {
    return Math.round(baseFare * surgeMultiplier);
};

/**
 * Get surge info for display to user
 */
export const getSurgeInfo = async (lat: number, lng: number): Promise<{
    multiplier: number;
    isActive: boolean;
    displayText: string;
}> => {
    const multiplier = await calculateSurgeMultiplier(lat, lng);
    const isActive = multiplier > 1.0;

    let displayText = '';
    if (multiplier >= 2.5) {
        displayText = 'High demand - prices are significantly higher';
    } else if (multiplier >= 1.5) {
        displayText = 'Moderate demand - prices are higher than usual';
    } else if (multiplier > 1.0) {
        displayText = 'Slight surge pricing in effect';
    }

    return {
        multiplier,
        isActive,
        displayText
    };
};

/**
 * Clear surge cache for an area (use when demand changes significantly)
 */
export const clearSurgeCache = async (lat: number, lng: number): Promise<void> => {
    const cacheKey = getSurgeGridKey(lat, lng);
    await redis.del(cacheKey);
};

/**
 * Get surge data for admin dashboard (heatmap data)
 */
export const getSurgeHeatmapData = async (): Promise<Array<{
    lat: number;
    lng: number;
    multiplier: number;
    demand: number;
    supply: number;
}>> => {
    // Get all active areas with pending rides
    const pendingRides = await prisma.ride.findMany({
        where: {
            status: 'PENDING',
            createdAt: {
                gte: new Date(Date.now() - 10 * 60 * 1000)
            }
        },
        select: {
            pickupLat: true,
            pickupLng: true
        }
    });

    // Group by grid cells
    const gridData = new Map<string, { lat: number; lng: number; count: number }>();
    
    for (const ride of pendingRides) {
        const gridLat = Math.round(ride.pickupLat * 100) / 100;
        const gridLng = Math.round(ride.pickupLng * 100) / 100;
        const key = `${gridLat}:${gridLng}`;
        
        if (!gridData.has(key)) {
            gridData.set(key, { lat: gridLat, lng: gridLng, count: 0 });
        }
        gridData.get(key)!.count++;
    }

    // Calculate surge for each grid cell
    const heatmapData = await Promise.all(
        Array.from(gridData.values()).map(async (cell) => {
            const multiplier = await calculateSurgeMultiplier(cell.lat, cell.lng);
            
            // Get supply count
            const nearbyCaptains = await prisma.captainProfile.count({
                where: {
                    isOnline: true,
                    isAvailable: true
                }
            });

            return {
                lat: cell.lat,
                lng: cell.lng,
                multiplier,
                demand: cell.count,
                supply: nearbyCaptains
            };
        })
    );

    return heatmapData;
};
