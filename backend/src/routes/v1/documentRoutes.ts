import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares";
import { authorizeRole } from "../../middlewares/roleMiddlewares";
import { 
    uploadDocument, 
    getMyDocuments, 
    deleteDocument, 
    getVerificationStatus 
} from "../../controllers/documentController";

const router = Router();

// All routes require authentication and CAPTAIN role
router.use(authenticate, authorizeRole("CAPTAIN"));

// Upload a document
router.post("/upload", uploadDocument);

// Get all my documents
router.get("/", getMyDocuments);

// Get verification status
router.get("/verification-status", getVerificationStatus);

// Delete a document
router.delete("/:documentId", deleteDocument);

export default router;
