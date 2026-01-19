import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares";
import { authorizeRole } from "../../middlewares/roleMiddlewares";
import {
    updateRiderAddresses,
    getRiderAddresses,
    uploadCaptainDocument,
    getCaptainDocuments,
    getFullProfile
} from "../../controllers/profileController";

const router = Router();

// Get full profile (both rider and captain)
router.get("/me", authenticate, getFullProfile);

// Rider address management
router.get("/rider/addresses", authenticate, authorizeRole("RIDER"), getRiderAddresses);
router.put("/rider/addresses", authenticate, authorizeRole("RIDER"), updateRiderAddresses);

// Captain document management
router.get("/captain/documents", authenticate, authorizeRole("CAPTAIN"), getCaptainDocuments);
router.post("/captain/documents", authenticate, authorizeRole("CAPTAIN"), uploadCaptainDocument);

export default router;
