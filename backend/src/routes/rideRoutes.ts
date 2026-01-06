import { authorizeRole } from "../middlewares/roleMiddlewares";
import { authenticate } from "../middlewares/authMiddelwares";
import { Router } from "express";
import { createRide, acceptRide } from "../controllers/rideController";

const router = Router();

router.post("/create", authenticate, authorizeRole("RIDER"), createRide);
router.post("/accept", authenticate, authorizeRole("CAPTAIN"), acceptRide);

export default router;