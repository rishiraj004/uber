import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddlewares.js";
import { authorizeAdmin } from "../../middlewares/roleMiddlewares.js";
import {
    getAllCaptains,
    getCaptainDetails,
    getPendingDocuments,
    reviewDocument,
    setCaptainVerification,
    getDashboardStats
} from "../../controllers/adminController.js";

const router = Router();

// All routes require authentication and ADMIN role
router.use(authenticate, authorizeAdmin);

// Dashboard stats
router.get("/stats", getDashboardStats);

// Captain management
router.get("/captains", getAllCaptains);
router.get("/captains/:captainId", getCaptainDetails);
router.patch("/captains/:captainId/verify", setCaptainVerification);

// Document review
router.get("/documents/pending", getPendingDocuments);
router.patch("/documents/:documentId/review", reviewDocument);

export default router;
