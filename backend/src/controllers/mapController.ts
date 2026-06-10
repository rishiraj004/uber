import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddlewares.js";
import { getAddressSuggestions, getDistanceAndDuration, retrieveSearchBoxResult } from "../services/mapService.js";

/**
 * Get address suggestions from Mapbox Search Box API
 * Uses session tokens for billing optimization
 * Supports proximity bias for better local results
 */
export const addressSuggestions = async (req: AuthRequest, res: Response) => {
    try {
        const { query, sessionToken, lat, lng } = req.query;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ message: "Query is required" });
        }

        if (query.trim().length < 2) {
            return res.status(200).json([]);
        }

        // Parse proximity coordinates if provided
        const proximity = lat && lng ? {
            lat: Number(lat),
            lng: Number(lng)
        } : undefined;

        const suggestions = await getAddressSuggestions(
            query,
            (sessionToken as string) || '',
            proximity
        );

        res.status(200).json(suggestions);
    } catch (error) {
        console.error("Error fetching address suggestions:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Retrieve full place details including coordinates
 * Called when user selects a Search Box suggestion
 */
export const retrievePlaceDetails = async (req: AuthRequest, res: Response) => {
    try {
        const { mapboxId, sessionToken } = req.query;

        if (!mapboxId || typeof mapboxId !== 'string') {
            return res.status(400).json({ message: "Mapbox ID is required" });
        }

        const result = await retrieveSearchBoxResult(
            mapboxId,
            (sessionToken as string) || ''
        );

        if (!result) {
            return res.status(404).json({ message: "Place not found" });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error("Error retrieving place details:", error);
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
