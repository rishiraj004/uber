import { Router } from "express";
import { toggleAvailability, updateLocation, getNearbyCaptains } from "../controllers/captainController";
import { authenticate } from "../middlewares/authMiddelwares";
import { authorizeRole } from "../middlewares/roleMiddlewares";

const router = Router();

router.patch("/toggle-status", authenticate, authorizeRole("CAPTAIN"), toggleAvailability);
router.post("/update-location", authenticate, authorizeRole("CAPTAIN"), updateLocation);
router.get("/nearby", authenticate, authorizeRole("RIDER"), getNearbyCaptains);

export default router;