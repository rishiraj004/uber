import { Router } from "express";
import { authenticate } from "../../middlewares/authMiddelwares";
import { authorizeRole } from "../../middlewares/roleMiddlewares";
import {
    getRazorpayKeyId,
    createOrder,
    getPaymentCheckoutOptions,
    verifyPayment,
    getSetupIntent,
    getUserPaymentMethods,
    removePaymentMethod,
    initializeCaptainPayout,
    initializeCaptainStripe,
    getCaptainPayoutStatus,
    getCaptainStripeStatus,
    getCaptainOnboarding,
    getCaptainWallet,
    createWithdrawal,
    getWithdrawals
} from "../../controllers/paymentController";

const router = Router();

// Razorpay configuration
router.get("/key", authenticate, getRazorpayKeyId);

// Razorpay order & payment
router.post("/order", authenticate, authorizeRole("RIDER"), createOrder);
router.get("/checkout/:rideId", authenticate, authorizeRole("RIDER"), getPaymentCheckoutOptions);
router.post("/verify", authenticate, authorizeRole("RIDER"), verifyPayment);

// Legacy rider payment methods (deprecated for Razorpay)
router.get("/setup-intent", authenticate, authorizeRole("RIDER"), getSetupIntent);
router.get("/methods", authenticate, authorizeRole("RIDER"), getUserPaymentMethods);
router.delete("/methods/:paymentMethodId", authenticate, authorizeRole("RIDER"), removePaymentMethod);

// Captain wallet & payouts
router.post("/captain/connect", authenticate, authorizeRole("CAPTAIN"), initializeCaptainPayout);
router.get("/captain/status", authenticate, authorizeRole("CAPTAIN"), getCaptainPayoutStatus);
router.get("/captain/onboarding", authenticate, authorizeRole("CAPTAIN"), getCaptainOnboarding);
router.get("/captain/wallet", authenticate, authorizeRole("CAPTAIN"), getCaptainWallet);
router.post("/captain/withdraw", authenticate, authorizeRole("CAPTAIN"), createWithdrawal);
router.get("/captain/withdrawals", authenticate, authorizeRole("CAPTAIN"), getWithdrawals);

export default router;
