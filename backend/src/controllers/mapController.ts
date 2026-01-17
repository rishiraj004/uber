import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares";
import { getAddressSuggestions, getDistanceAndDuration } from "../services/mapService";

/**
 * Get address suggestions from Mapbox Geocoding API
 * Uses session tokens for billing optimization
 */
export const addressSuggestions = async (req: AuthRequest, res: Response) => {
    try {
        const { query, sessionToken } = req.query;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ message: "Query is required" });
        }

        if (query.trim().length < 2) {
            return res.status(200).json([]);
        }

        const suggestions = await getAddressSuggestions(
            query,
            (sessionToken as string) || ''
        );

        res.status(200).json(suggestions);
    } catch (error) {
        console.error("Error fetching address suggestions:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get driving directions between two points
 * Returns distance (km), duration (minutes), and route geometry
 */
export const getDirections = async (req: AuthRequest, res: Response) => {
    try {
        const { originLat, originLng, destLat, destLng } = req.query;

        if (!originLat || !originLng || !destLat || !destLng) {
            return res.status(400).json({ message: "Origin and destination coordinates are required" });
        }

        const result = await getDistanceAndDuration(
            [Number(originLng), Number(originLat)],
            [Number(destLng), Number(destLat)]
        );

        if (!result) {
            return res.status(400).json({ message: "Unable to calculate directions" });
        }

        res.status(200).json({
            distanceKm: parseFloat(result.distanceKm.toFixed(2)),
            durationMinutes: parseFloat(result.durationMinutes.toFixed(2)),
            geometry: result.geometry
        });
    } catch (error) {
        console.error("Error fetching directions:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
