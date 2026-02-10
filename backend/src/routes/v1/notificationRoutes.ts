import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares.js";
import { registerFcmToken, unregisterFcmToken } from "../../controllers/notificationController.js";

const router = Router();

// Register FCM token for push notifications
router.post("/register", authenticate, registerFcmToken);

// Unregister FCM token (on logout)
router.delete("/unregister", authenticate, unregisterFcmToken);

export default router;
