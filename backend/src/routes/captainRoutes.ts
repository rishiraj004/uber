import { Router } from "express";
import { toggleAvailability, updateLocation } from "../controllers/captainController";
import { authenticate } from "../middlewares/authMiddelwares";
import { authorizeRole } from "../middlewares/roleMiddlewares";

const router = Router();

router.patch("/toggle-status", authenticate, authorizeRole("CAPTAIN"), toggleAvailability);
router.post("/update-location", authenticate, authorizeRole("CAPTAIN"), updateLocation);

export default router;