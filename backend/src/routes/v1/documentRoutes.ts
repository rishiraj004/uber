import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares";
import { authorizeRole } from "../../middlewares/roleMiddlewares";
import { 
    uploadDocument, 
    getMyDocuments, 
    deleteDocument, 
    getVerificationStatus 
} from "../../controllers/documentController";
import {
    verifyDocument,
    syncWithGovtRecords,
    checkExpiredDocuments
} from "../../controllers/documentVerificationController";

const router = Router();

// Captain routes
router.use(authenticate);

// Upload a document (Captain only)
router.post("/upload", authorizeRole("CAPTAIN"), uploadDocument);

// Get all my documents (Captain only)
router.get("/", authorizeRole("CAPTAIN"), getMyDocuments);

// Get verification status (Captain only)
router.get("/verification-status", authorizeRole("CAPTAIN"), getVerificationStatus);

// Sync with govt records - Captain manual refresh
router.post("/sync", authorizeRole("CAPTAIN"), syncWithGovtRecords);

// Delete a document (Captain only)
router.delete("/:documentId", authorizeRole("CAPTAIN"), deleteDocument);

// Admin routes
// Verify a document with OCR (Admin only)
router.post("/:documentId/verify", authorizeRole("ADMIN"), verifyDocument);

// Manually trigger expiry check (Admin only)
router.post("/check-expiry", authorizeRole("ADMIN"), checkExpiredDocuments);

export default router;
