import { Router } from "express";
import { authenticate, authorizeRole, attachCaptainProfile } from "../../middlewares/index.js";
import * as biddingController from "../../controllers/biddingController.js";

const router = Router();

/**
 * @route POST /api/v1/bids/:rideId
 * @desc Captain places a bid on a ride
 * @access Private (Captain)
 */
router.post(
    "/:rideId",
    authenticate,
    authorizeRole("CAPTAIN"),
    attachCaptainProfile,
    biddingController.createBid
);

/**
 * @route PATCH /api/v1/bids/:rideId
 * @desc Captain updates their bid
 * @access Private (Captain)
 */
router.patch(
    "/:rideId",
    authenticate,
    authorizeRole("CAPTAIN"),
    attachCaptainProfile,
    biddingController.updateBid
);

/**
 * @route GET /api/v1/bids/:rideId
 * @desc Get all bids for a ride (for rider)
 * @access Private
 */
router.get(
    "/:rideId",
    authenticate,
    biddingController.getRideBids
);

/**
 * @route POST /api/v1/bids/:rideId/select/:bidId
 * @desc Rider selects a bid
 * @access Private (Rider)
 */
router.post(
    "/:rideId/select/:bidId",
    authenticate,
    biddingController.selectBid
);

/**
 * @route DELETE /api/v1/bids/:rideId
 * @desc Captain withdraws their bid
 * @access Private (Captain)
 */
router.delete(
    "/:rideId",
    authenticate,
    authorizeRole("CAPTAIN"),
    attachCaptainProfile,
    biddingController.withdrawBid
);

export default router;
