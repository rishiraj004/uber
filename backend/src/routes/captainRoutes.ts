import { Router } from "express";
import { toggleAvailability } from "../controllers/captainController";
import { authenticate } from "../middlewares/authMiddelwares";
import { authorizeRole } from "../middlewares/roleMiddlewares";

const router = Router();

router.patch("/toggle-status", authenticate, authorizeRole("CAPTAIN"), toggleAvailability);

export default router;