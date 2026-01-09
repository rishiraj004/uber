import { authorizeRole } from "../../middlewares/roleMiddlewares";
import { authenticate } from "../../middlewares/authMiddelwares";
import { Router } from "express";
import { calculateFare, createRide, acceptRide, arrivedAtPickup, startRide, completeRide, cancelRide } from "../../controllers/rideController";

const router = Router();

router.post("/calculate-fare", authenticate, authorizeRole("RIDER"), calculateFare);

router.post("/create-ride", authenticate, authorizeRole("RIDER"), createRide);
router.post("/accept-ride", authenticate, authorizeRole("CAPTAIN"), acceptRide);
router.post("/arrived-at-pickup", authenticate, authorizeRole("CAPTAIN"), arrivedAtPickup);
router.post("/start-ride", authenticate, authorizeRole("CAPTAIN"), startRide);
router.post("/complete-ride", authenticate, authorizeRole("CAPTAIN"), completeRide);
router.post("/cancel-ride", authenticate, cancelRide);

export default router;