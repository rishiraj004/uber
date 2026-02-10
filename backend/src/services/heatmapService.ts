import redis from '../config/redis.js';
import ngeohash from 'ngeohash';

/**
 * Heatmap Service - Tracks rider search events for captain demand heatmaps
 * 
 * Uses Redis with geohashing to store and aggregate search events.
 * Data expires after 15-30 minutes to show only recent demand.
 * 
 * Geohash precision levels:
 * - 5: ~4.9km x 4.9km (city-level)
 * - 6: ~1.2km x 0.6km (neighborhood-level) - We use this
 * - 7: ~150m x 150m (block-level)
 */

const SEARCH_EVENT_TTL = 900; // 15 minutes in seconds
const GEOHASH_PRECISION = 6; // ~1.2km cells
const HEATMAP_KEY = 'rider_searches';

interface SearchEvent {
    lat: number;
    lng: number;
    timestamp: number;
}

interface HeatmapCell {
    geohash: string;
    lat: number;
    lng: number;
    count: number;
    intensity: 'low' | 'medium' | 'high' | 'very_high';
}

/**
 * Record a rider search event
 * Called when a rider enters coordinates in the app
 */
export const recordSearchEvent = async (
    lat: number,
    lng: number,
    riderId?: number
): Promise<void> => {
    const geohash = ngeohash.encode(lat, lng, GEOHASH_PRECISION);
    const timestamp = Date.now();
    const eventKey = `${HEATMAP_KEY}:${geohash}`;
    
    // Increment search count for this geohash cell
    await redis.incr(eventKey);
    
    // Set/refresh TTL
    await redis.expire(eventKey, SEARCH_EVENT_TTL);
    
    // Also store in a sorted set for time-based queries
    const detailKey = `${HEATMAP_KEY}:detail:${geohash}`;
    await redis.zadd(detailKey, timestamp, `${lat},${lng},${timestamp}`);
    await redis.expire(detailKey, SEARCH_EVENT_TTL);
    
    // Add geohash to active cells set
    await redis.sadd(`${HEATMAP_KEY}:active`, geohash);
    await redis.expire(`${HEATMAP_KEY}:active`, SEARCH_EVENT_TTL);
};

/**
 * Get heatmap data for captain dashboard
 * Returns cells with search density
 */
export const getHeatmapData = async (
    centerLat: number,
    centerLng: number,
    radiusKm: number = 10
): Promise<HeatmapCell[]> => {
    // Get all active geohash cells
    const activeCells = await redis.smembers(`${HEATMAP_KEY}:active`);
    
    if (!activeCells || activeCells.length === 0) {
        return [];
    }
    
    const heatmapCells: HeatmapCell[] = [];
    
    for (const geohash of activeCells) {
        // Get count for this cell
        const count = await redis.get(`${HEATMAP_KEY}:${geohash}`);
        
        if (!count || parseInt(count) === 0) continue;
        
        // Decode geohash to get center coordinates
        const { latitude, longitude } = ngeohash.decode(geohash);
        
        // Check if within radius
        const distance = haversineDistance(centerLat, centerLng, latitude, longitude);
        if (distance > radiusKm) continue;
        
        const searchCount = parseInt(count);
        
        heatmapCells.push({
            geohash,
            lat: latitude,
            lng: longitude,
            count: searchCount,
            intensity: getIntensityLevel(searchCount)
        });
    }
    
    // Sort by count descending
    return heatmapCells.sort((a, b) => b.count - a.count);
};

/**
 * Get surge zones based on heatmap data
 * Returns areas where demand is high (for surge pricing integration)
 */
export const getSurgeZones = async (): Promise<{
    geohash: string;
    lat: number;
    lng: number;
    demandLevel: number;
    suggestedSurge: number;
}[]> => {
    const activeCells = await redis.smembers(`${HEATMAP_KEY}:active`);
    
    if (!activeCells || activeCells.length === 0) {
        return [];
    }
    
    const surgeZones = [];
    
    for (const geohash of activeCells) {
        const count = await redis.get(`${HEATMAP_KEY}:${geohash}`);
        if (!count) continue;
        
        const searchCount = parseInt(count);
        if (searchCount < 5) continue; // Only consider zones with significant demand
        
        const { latitude, longitude } = ngeohash.decode(geohash);
        
        // Calculate suggested surge based on demand
        let suggestedSurge = 1.0;
        if (searchCount >= 20) suggestedSurge = 2.0;
        else if (searchCount >= 15) suggestedSurge = 1.75;
        else if (searchCount >= 10) suggestedSurge = 1.5;
        else if (searchCount >= 5) suggestedSurge = 1.25;
        
        surgeZones.push({
            geohash,
            lat: latitude,
            lng: longitude,
            demandLevel: searchCount,
            suggestedSurge
        });
    }
    
    return surgeZones.sort((a, b) => b.demandLevel - a.demandLevel);
};

/**
 * Get real-time statistics for a specific area
 */
export const getAreaStats = async (
    lat: number,
    lng: number
): Promise<{
    searchesNearby: number;
    demandLevel: string;
    suggestedMoveTo: { lat: number; lng: number } | null;
}> => {
    // Get geohash for current location
    const currentGeohash = ngeohash.encode(lat, lng, GEOHASH_PRECISION);
    
    // Get neighboring geohashes
    const neighbors = ngeohash.neighbors(currentGeohash);
    const allCells = [currentGeohash, ...Object.values(neighbors)];
    
    let totalSearches = 0;
    let highestCell = { geohash: '', count: 0 };
    
    for (const geohash of allCells) {
        const count = await redis.get(`${HEATMAP_KEY}:${geohash}`);
        if (count) {
            const c = parseInt(count);
            totalSearches += c;
            if (c > highestCell.count) {
                highestCell = { geohash, count: c };
            }
        }
    }
    
    let suggestedMoveTo = null;
    if (highestCell.geohash && highestCell.geohash !== currentGeohash && highestCell.count > 3) {
        const { latitude, longitude } = ngeohash.decode(highestCell.geohash);
        suggestedMoveTo = { lat: latitude, lng: longitude };
    }
    
    return {
        searchesNearby: totalSearches,
        demandLevel: getDemandLevelText(totalSearches),
        suggestedMoveTo
    };
};

/**
 * Clean up expired data (called periodically)
 */
export const cleanupExpiredData = async (): Promise<number> => {
    const activeCells = await redis.smembers(`${HEATMAP_KEY}:active`);
    let cleaned = 0;
    
    for (const geohash of activeCells) {
        const exists = await redis.exists(`${HEATMAP_KEY}:${geohash}`);
        if (!exists) {
            await redis.srem(`${HEATMAP_KEY}:active`, geohash);
            cleaned++;
        }
    }
    
    return cleaned;
};

// Alias for cron job service
export const cleanupHeatmapData = cleanupExpiredData;

// Helper functions

function getIntensityLevel(count: number): 'low' | 'medium' | 'high' | 'very_high' {
    if (count >= 15) return 'very_high';
    if (count >= 10) return 'high';
    if (count >= 5) return 'medium';
    return 'low';
}

function getDemandLevelText(count: number): string {
    if (count >= 20) return 'Very High Demand';
    if (count >= 15) return 'High Demand';
    if (count >= 10) return 'Moderate Demand';
    if (count >= 5) return 'Low Demand';
    return 'Minimal Activity';
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}
