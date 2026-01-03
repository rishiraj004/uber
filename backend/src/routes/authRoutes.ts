import { Router } from "express";
import { signup, login, getProfile } from "../controllers/authController";
import { authenticate } from "../middlewares/authMiddelwares";
import { authorizeRole } from "../middlewares/roleMiddlewares";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/profile", authenticate, getProfile);
router.get("/captain-dashboard", authenticate, authorizeRole("CAPTAIN"), (req, res) => {
    res.json({ message: "Welcome to the Captain Dashboard!" });
});

export default router;