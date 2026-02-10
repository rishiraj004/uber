import { Request, Response, NextFunction } from "express";
import * as heatmapService from "../services/heatmapService.js";

/**
 * Heatmap Controller - Captain demand visualization
 */

/**
 * @desc Record a rider search event (for heatmap data)
 * @route POST /api/v1/heatmap/search-event
 * @access Private (Rider)
 */
export const recordSearchEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { lat, lng } = req.body;
        const riderId = (req as any).user?.userId;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required"
            });
        }

        await heatmapService.recordSearchEvent(lat, lng, riderId);

        return res.status(200).json({
            success: true,
            message: "Search event recorded"
        });
    } catch (error: any) {
        console.error("Record search event error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to record search event"
        });
    }
};

/**
 * @desc Get heatmap data for captain dashboard
 * @route GET /api/v1/heatmap
 * @access Private (Captain)
 */
export const getHeatmapData = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { lat, lng, radius } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required"
            });
        }

        const heatmapData = await heatmapService.getHeatmapData(
            parseFloat(lat as string),
            parseFloat(lng as string),
            radius ? parseFloat(radius as string) : 10
        );

        return res.status(200).json({
            success: true,
            data: heatmapData
        });
    } catch (error: any) {
        console.error("Get heatmap error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get heatmap data"
        });
    }
};

/**
 * @desc Get surge zones for pricing
 * @route GET /api/v1/heatmap/surge-zones
 * @access Private (Captain/Admin)
 */
export const getSurgeZones = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const surgeZones = await heatmapService.getSurgeZones();

        return res.status(200).json({
            success: true,
            data: surgeZones
        });
    } catch (error: any) {
        console.error("Get surge zones error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get surge zones"
        });
    }
};

/**
 * @desc Get area statistics for captain's current location
 * @route GET /api/v1/heatmap/area-stats
 * @access Private (Captain)
 */
export const getAreaStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required"
            });
        }

        const stats = await heatmapService.getAreaStats(
            parseFloat(lat as string),
            parseFloat(lng as string)
        );

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        console.error("Get area stats error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get area statistics"
        });
    }
};
