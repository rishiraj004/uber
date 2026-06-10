import { authorizeRole } from "../../middlewares/roleMiddlewares.js";
import { authenticate } from "../../middlewares/authMiddlewares.js";
import { Router } from "express";
import {
    calculateFare,
    getRideDetails,
    getRideById,
    createRide,
    acceptRide,
    arrivedAtPickup,
    startRide,
    completeRide,
    cancelRide,
    getRidePath,
    getRideHistory,
    getRideHistoryDetail,
    checkSurge,
    initiatePaymentCollection,
    confirmCashPayment,
    confirmInAppPayment,
    getPaymentStatus,
    updatePaymentMethod
} from "../../controllers/rideController.js";

const router = Router();

router.get("/details/:userId", authenticate, getRideDetails);
router.get("/history", authenticate, getRideHistory);
router.get("/history/:rideId", authenticate, getRideHistoryDetail);
router.get("/:rideId", authenticate, getRideById);  // Get specific ride by ID (for Receipt/Review)
router.post("/calculate-fare", authenticate, authorizeRole("RIDER"), calculateFare);
router.post("/check-surge", authenticate, authorizeRole("RIDER"), checkSurge);

router.post("/create-ride", authenticate, authorizeRole("RIDER"), createRide);
router.post("/accept-ride", authenticate, authorizeRole("CAPTAIN"), acceptRide);
router.post("/arrived-at-pickup", authenticate, authorizeRole("CAPTAIN"), arrivedAtPickup);
router.post("/start-ride", authenticate, authorizeRole("CAPTAIN"), startRide);
router.post("/complete-ride", authenticate, authorizeRole("CAPTAIN"), completeRide);
router.post("/cancel-ride", authenticate, cancelRide);

// Payment collection endpoints
router.post("/initiate-payment", authenticate, authorizeRole("CAPTAIN"), initiatePaymentCollection);
router.post("/confirm-cash-payment", authenticate, authorizeRole("CAPTAIN"), confirmCashPayment);
router.post("/confirm-in-app-payment", authenticate, authorizeRole("RIDER"), confirmInAppPayment);
router.get("/payment-status/:rideId", authenticate, getPaymentStatus);
router.patch("/:rideId/payment-method", authenticate, authorizeRole("RIDER"), updatePaymentMethod);

router.get("/path/:rideId", authenticate, getRidePath);

export default router;