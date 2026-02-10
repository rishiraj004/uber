import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares.js";
import { updateFcmToken, removeFcmToken } from "../services/pushNotificationService.js";

/**
 * Register/Update FCM token for push notifications
 */
export const registerFcmToken = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { fcmToken } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!fcmToken) {
            return res.status(400).json({ message: "FCM token is required" });
        }

        await updateFcmToken(userId, fcmToken);
        res.status(200).json({ message: "FCM token registered successfully" });
    } catch (error: any) {
        console.error("Error registering FCM token:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

/**
 * Unregister FCM token (on logout)
 */
export const unregisterFcmToken = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await removeFcmToken(userId);
        res.status(200).json({ message: "FCM token removed successfully" });
    } catch (error: any) {
        console.error("Error removing FCM token:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};
