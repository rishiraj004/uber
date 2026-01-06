import { authorizeRole } from "../../middlewares/roleMiddlewares";
import { authenticate } from "../../middlewares/authMiddelwares";
import { Router } from "express";
import { createRide, acceptRide, startRide, completeRide } from "../../controllers/rideController";

const router = Router();

router.post("/create-ride", authenticate, authorizeRole("RIDER"), createRide);
router.post("/accept-ride", authenticate, authorizeRole("CAPTAIN"), acceptRide);
router.post("/start-ride", authenticate, authorizeRole("CAPTAIN"), startRide);
router.post("/complete-ride", authenticate, authorizeRole("CAPTAIN"), completeRide);

export default router;