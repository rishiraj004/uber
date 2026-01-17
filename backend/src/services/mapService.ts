import prisma from "../config/prisma";
import redis from "../config/redis";
import axios from "axios";

const MAPBOX_API_KEY = process.env.MAPBOX_API_KEY;

export const getAddressSuggestions = async ( query: string, sessionToken: string ) => {
    try {
        const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`, {
            params: {
                q: query,
                access_token: MAPBOX_API_KEY,
                autocomplete: true,
                session_token: sessionToken,
                limit: 5
            }
        });
        return response.data.features.map((feature: any) => ({
            name: feature.place_name,
            latitude: feature.center[1],
            longitude: feature.center[0]
        }));
    } catch (error) {
        console.error("Error fetching address suggestions:", error);
        return [];
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
        const response = await prisma.captainProfile.findMany({
            where: {
                id: { in: nearbyCaptainIDs.map(id => Number(id)) },
                isOnline: true,
                isAvailable: true
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
        console.log("Nearby captains found:", response);
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
