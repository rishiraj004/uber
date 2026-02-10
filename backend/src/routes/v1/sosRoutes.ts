import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares.js";
import {
    triggerSOS,
    resolveSOS,
    getActiveAlerts,
    createShareLink,
    getSharedRide,
    deactivateShareLink,
    saveEmergencyContacts,
    getEmergencyContacts
} from "../../controllers/sosController.js";

const router = Router();

// SOS Alert routes (require auth)
router.post("/trigger", authenticate, triggerSOS);
router.post("/resolve", authenticate, resolveSOS);
router.get("/active", authenticate, getActiveAlerts);

// Ride Sharing routes
router.post("/share/create", authenticate, createShareLink);
router.post("/share/deactivate", authenticate, deactivateShareLink);
router.get("/share/:token", getSharedRide); // Public route - no auth

// Emergency Contacts
router.post("/contacts", authenticate, saveEmergencyContacts);
router.get("/contacts", authenticate, getEmergencyContacts);

export default router;
