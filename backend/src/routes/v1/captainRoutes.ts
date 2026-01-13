import { Router } from "express";
import { toggleAvailability, updateLocation, getNearbyCaptains, getCaptainStatus } from "../../controllers/captainController";
import { authenticate, authorizeRole } from "../../middlewares";

const router = Router();

router.patch("/toggle-status", authenticate, authorizeRole("CAPTAIN"), toggleAvailability);
router.post("/update-location", authenticate, authorizeRole("CAPTAIN"), updateLocation);
router.get("/nearby", authenticate, authorizeRole("RIDER"), getNearbyCaptains);
router.get("/status", authenticate, authorizeRole("CAPTAIN"), getCaptainStatus);
export default router;