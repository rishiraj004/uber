import { Router } from "express";
import { signup, login, getProfile } from "../../controllers/authController.js";
import { authenticate } from "../../middlewares/authMiddlewares.js";
import { authorizeRole } from "../../middlewares/roleMiddlewares.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/profile", authenticate, getProfile);
router.get("/captain-dashboard", authenticate, authorizeRole("CAPTAIN"), (req, res) => {
    res.json({ message: "Welcome to the Captain Dashboard!" });
});

export default router;