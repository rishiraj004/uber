import { Router } from "express";
import { authenticate, authorizeRole } from "../../middlewares";
import * as rideSharingController from "../../controllers/rideSharingController";

const router = Router();

/**
 * @route POST /api/v1/ride-sharing/find-match
 * @desc Find matching shared rides for a new rider
 * @access Private (Rider)
 */
router.post(
    "/find-match",
    authenticate,
    rideSharingController.findSharedRideMatch
);

/**
 * @route POST /api/v1/ride-sharing/join/:rideId
 * @desc Join an existing shared ride
 * @access Private (Rider)
 */
router.post(
    "/join/:rideId",
    authenticate,
    rideSharingController.joinSharedRide
);

/**
 * @route GET /api/v1/ride-sharing/:rideId/passengers
 * @desc Get all passengers in a shared ride group
 * @access Private (Rider/Captain)
 */
router.get(
    "/:rideId/passengers",
    authenticate,
    rideSharingController.getSharedRidePassengers
);

/**
 * @route POST /api/v1/ride-sharing/initialize/:rideId
 * @desc Initialize a ride as shareable
 * @access Private (Rider)
 */
router.post(
    "/initialize/:rideId",
    authenticate,
    rideSharingController.initializeSharedRide
);

export default router;
