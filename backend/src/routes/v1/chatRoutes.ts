import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares";
import { sendChatMessage, getChatMessages } from "../../controllers/chatController";

const router = Router();

// Send a chat message
router.post("/send", authenticate, sendChatMessage);

// Get chat messages for a ride
router.get("/:rideId", authenticate, getChatMessages);

export default router;
