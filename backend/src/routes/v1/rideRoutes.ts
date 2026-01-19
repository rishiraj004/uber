import { authorizeRole } from "../../middlewares/roleMiddlewares";
import { authenticate } from "../../middlewares/authMiddelwares";
import { Router } from "express";
import { calculateFare, getRideDetails, getRideById, createRide, acceptRide, arrivedAtPickup, startRide, completeRide, cancelRide, getRidePath, getRideHistory, getRideHistoryDetail } from "../../controllers/rideController";

const router = Router();

router.get("/details/:userId", authenticate, getRideDetails);
router.get("/:rideId", authenticate, getRideById);  // Get specific ride by ID (for Receipt/Review)
router.post("/calculate-fare", authenticate, authorizeRole("RIDER"), calculateFare);

router.post("/create-ride", authenticate, authorizeRole("RIDER"), createRide);
router.post("/accept-ride", authenticate, authorizeRole("CAPTAIN"), acceptRide);
router.post("/arrived-at-pickup", authenticate, authorizeRole("CAPTAIN"), arrivedAtPickup);
router.post("/start-ride", authenticate, authorizeRole("CAPTAIN"), startRide);
router.post("/complete-ride", authenticate, authorizeRole("CAPTAIN"), completeRide);
router.post("/cancel-ride", authenticate, cancelRide);

router.get("/path/:rideId", authenticate, getRidePath);

// Ride history endpoints
router.get("/history", authenticate, getRideHistory);
router.get("/history/:rideId", authenticate, getRideHistoryDetail);

export default router;