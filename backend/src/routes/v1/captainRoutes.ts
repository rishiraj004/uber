import { Router } from "express";
import { toggleAvailability, updateLocation, getNearbyCaptains, getCaptainStatus, getAnalytics } from "../../controllers/captainController.js";
import { authenticate, authorizeRole } from "../../middlewares/index.js";

const router = Router();

router.patch("/toggle-status", authenticate, authorizeRole("CAPTAIN"), toggleAvailability);
router.post("/update-location", authenticate, authorizeRole("CAPTAIN"), updateLocation);
router.get("/nearby", authenticate, authorizeRole("RIDER"), getNearbyCaptains);
router.get("/status", authenticate, authorizeRole("CAPTAIN"), getCaptainStatus);
router.get("/analytics", authenticate, authorizeRole("CAPTAIN"), getAnalytics);
export default router;