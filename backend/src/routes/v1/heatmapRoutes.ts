import { Router } from "express";
import { authenticate, authorizeRole, attachCaptainProfile } from "../../middlewares";
import * as heatmapController from "../../controllers/heatmapController";

const router = Router();

/**
 * @route POST /api/v1/heatmap/search-event
 * @desc Record a rider search event
 * @access Private (Rider)
 */
router.post(
    "/search-event",
    authenticate,
    heatmapController.recordSearchEvent
);

/**
 * @route GET /api/v1/heatmap
 * @desc Get heatmap data for captain dashboard
 * @access Private (Captain)
 */
router.get(
    "/",
    authenticate,
    authorizeRole("CAPTAIN"),
    attachCaptainProfile,
    heatmapController.getHeatmapData
);

/**
 * @route GET /api/v1/heatmap/surge-zones
 * @desc Get surge zones for pricing
 * @access Private (Captain)
 */
router.get(
    "/surge-zones",
    authenticate,
    authorizeRole("CAPTAIN"),
    heatmapController.getSurgeZones
);

/**
 * @route GET /api/v1/heatmap/area-stats
 * @desc Get area statistics for captain's location
 * @access Private (Captain)
 */
router.get(
    "/area-stats",
    authenticate,
    authorizeRole("CAPTAIN"),
    heatmapController.getAreaStats
);

export default router;
