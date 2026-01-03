import { Router } from "express";
import { signup, login, getProfile } from "../controllers/authController";
import { authenticate } from "../middlewares/authMiddelwares";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/profile", authenticate, getProfile);

export default router;