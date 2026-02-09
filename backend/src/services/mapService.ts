import prisma from "../config/prisma";
import redis from "../config/redis";
import axios from "axios";

const MAPBOX_API_KEY = process.env.MAPBOX_API_KEY;

/**
 * Get address suggestions using Mapbox Search Box API v1
 * This API provides better results for POIs, landmarks, and small localities
 * compared to the older Geocoding API v5
 */
export const getAddressSuggestions = async (query: string, sessionToken: string, proximity?: { lat: number; lng: number }) => {
    try {
        // Use Search Box API for better locality and POI results
        const params: Record<string, string | number | boolean> = {
            q: query,
            access_token: MAPBOX_API_KEY!,
            session_token: sessionToken,
            limit: 8,
            language: 'en',
            types: 'poi,address,place,locality,neighborhood,street'
        };

        // Add proximity bias if user location is available (improves local results)
        if (proximity) {
            params.proximity = `${proximity.lng},${proximity.lat}`;
        }

        const response = await axios.get('https://api.mapbox.com/search/searchbox/v1/suggest', { params });

        if (!response.data.suggestions || response.data.suggestions.length === 0) {
            // Fallback to Geocoding API for broader results
            return await getAddressSuggestionsFallback(query, sessionToken);
        }

        // Map suggestions to our format
        return response.data.suggestions.map((suggestion: any) => ({
            name: suggestion.name,
            fullAddress: suggestion.full_address || suggestion.place_formatted || suggestion.name,
            mapboxId: suggestion.mapbox_id,
            featureType: suggestion.feature_type,
            // Coordinates will be fetched on selection via retrieve endpoint
            latitude: null,
            longitude: null
        }));
    } catch (error) {
        console.error("Error fetching address suggestions:", error);
        // Fallback to Geocoding API
        return await getAddressSuggestionsFallback(query, sessionToken);
    }
};

/**
 * Fallback to Geocoding API v5 for broader coverage
 */
const getAddressSuggestionsFallback = async (query: string, sessionToken: string) => {
    try {
        const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`, {
            params: {
                access_token: MAPBOX_API_KEY,
                autocomplete: true,
                session_token: sessionToken,
                limit: 5,
                types: 'poi,address,place,locality,neighborhood'
            }
        });
        return response.data.features.map((feature: any) => ({
            name: feature.text,
            fullAddress: feature.place_name,
            latitude: feature.center[1],
            longitude: feature.center[0],
            featureType: feature.place_type?.[0] || 'place'
        }));
    } catch (error) {
        console.error("Fallback geocoding error:", error);
        return [];
    }
};

/**
 * Retrieve full details including coordinates for a Search Box suggestion
 * This is called when user selects a suggestion
 */
export const retrieveSearchBoxResult = async (mapboxId: string, sessionToken: string) => {
    try {
        const response = await axios.get(`https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}`, {
            params: {
                access_token: MAPBOX_API_KEY,
                session_token: sessionToken
            }
        });

        const feature = response.data.features?.[0];
        if (!feature) {
            throw new Error("No feature found");
        }

        return {
            name: feature.properties?.name || feature.properties?.full_address,
            fullAddress: feature.properties?.full_address || feature.properties?.place_formatted,
            latitude: feature.geometry?.coordinates[1],
            longitude: feature.geometry?.coordinates[0]
        };
    } catch (error) {
        console.error("Error retrieving search result:", error);
        return null;
    }
};

export const getCoordinatesFromId = async (mapboxId: string, sessionToken: string) => {
    try {
        const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${mapboxId}.json`, {
            params: {
                access_token: MAPBOX_API_KEY,
                session_token: sessionToken
            }
        });
        const feature = response.data.features[0];
        return {
            latitude: feature.center[1],
            longitude: feature.center[0]
        };
    } catch (error) {
        console.error("Error fetching coordinates from ID:", error);
        return null;
    }
};

export const getDistanceAndDuration = async ( origin: [number, number] , destination: [number, number] ) => {
    try {
        // origin and destination are [lat, lng], but Mapbox expects [lng, lat]
        const originStr = `${origin[1]},${origin[0]}`;
        const destStr = `${destination[1]},${destination[0]}`;
        
        const response = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${originStr};${destStr}`, {
            params: {
                access_token: MAPBOX_API_KEY,
                geometries: "geojson",
                overview: "simplified"
            }
        });
        const data = response.data;
        if (!data.routes || data.routes.length === 0) {
            throw new Error("No routes found");
        }
        const route = data.routes[0];
        return {
            distanceKm: route.distance / 1000,
            durationMinutes: route.duration / 60,
            geometry: route.geometry
        };
    } catch (error) {
        console.error("Error fetching distance and duration:", error);
        return null;
    }
};

/**
 * Get route for multiple waypoints (ordered) using Mapbox Directions API.
 * Caches results in Redis for short TTL to avoid rate limits.
 */
export const getRouteForWaypoints = async (waypoints: [number, number][]) => {
    try {
        if (!waypoints || waypoints.length < 2) return null;

        // Build cache key
        const key = `route:${waypoints.map(p => `${p[0]},${p[1]}`).join('|')}`;
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }

        const coordStrings = waypoints.map(p => `${p[1]},${p[0]}`); // lng,lat
        const path = coordStrings.join(';');

        const response = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${path}`, {
            params: {
                access_token: MAPBOX_API_KEY,
                geometries: 'geojson',
                overview: 'full'
            }
        });

        const data = response.data;
        if (!data.routes || data.routes.length === 0) return null;
        const route = data.routes[0];
        const result = {
            distanceKm: route.distance / 1000,
            durationMinutes: route.duration / 60,
            geometry: route.geometry
        };

        // Cache short-lived
        await redis.setex(key, 60, JSON.stringify(result));

        return result;
    } catch (error) {
        console.error('Error fetching route for waypoints:', error);
        return null;
    }
};

export const findNearbyCaptains = async ( riderLat: number , riderLng : number , radiusKm : number = 5) => {
    try {
        const nearbyCaptainIDs = await redis.georadius(
            "captain_locations",
            riderLng,
            riderLat,
            radiusKm,
            "km"
        );
        console.log("Nearby captain IDs from Redis:", nearbyCaptainIDs);

        if (!nearbyCaptainIDs || nearbyCaptainIDs.length === 0) return [];

        // Redis stores the CaptainProfile id
        // Only include verified, online, and available captains
        const response = await prisma.captainProfile.findMany({
            where: {
                id: { in: nearbyCaptainIDs.map(id => Number(id)) },
                isOnline: true,
                isAvailable: true,
                isVerified: true  // Only verified captains can receive ride requests
            },
            select: {
                id: true,
                lastLat: true,
                lastLng: true,
                rating: true,
                user: {
                    select: {
                        fullName: true
                    }
                }
            }
        });
        console.log("Nearby verified captains found:", response);
        return response.map(captain => ({
            id: captain.id,
            fullName: captain.user.fullName,
            lastLat: captain.lastLat,
            lastLng: captain.lastLng,
            rating: captain.rating
        }));
    } catch (error) {
        console.error("Error finding nearby captains:", error);
        return [];
    }
}
