import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares";
import {
    getOrCreateRazorpayCustomer,
    createRazorpayOrder,
    confirmPayment,
    createCaptainConnectAccount,
    getCaptainOnboardingLink,
    checkCaptainAccountStatus,
    requestWithdrawal,
    getWithdrawalHistory,
    getWalletSummary,
    getCheckoutOptions,
    getRazorpayKey
} from "../services/paymentService";
import prisma from "../config/prisma";

/**
 * Get Razorpay key for frontend
 */
export const getRazorpayKeyId = async (req: AuthRequest, res: Response) => {
    try {
        const key = getRazorpayKey();
        res.status(200).json({ key });
    } catch (error: any) {
        console.error("Error getting Razorpay key:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

/**
 * Create Razorpay order for a ride
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        // Get ride details
        const ride = await prisma.ride.findUnique({
            where: { id: parseInt(rideId) },
            select: { id: true, fare: true, riderId: true }
        });

        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if (!ride.fare) {
            return res.status(400).json({ message: "Ride fare not calculated" });
        }

        // Get or create customer
        const customerId = await getOrCreateRazorpayCustomer(userId);

        // Create Razorpay order
        const order = await createRazorpayOrder(ride.id, ride.fare, customerId);

        res.status(200).json({
            orderId: order.orderId,
            amount: order.amount,
            currency: order.currency,
            key: order.key
        });
    } catch (error: any) {
        console.error("Error creating Razorpay order:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

/**
 * Get checkout options for frontend Razorpay integration
 */
export const getPaymentCheckoutOptions = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId) {
            return res.status(400).json({ message: "Ride ID is required" });
        }

        const options = await getCheckoutOptions(parseInt(rideId), userId);
        res.status(200).json(options);
    } catch (error: any) {
        console.error("Error getting checkout options:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

/**
 * Verify and confirm Razorpay payment
 */
export const verifyPayment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { rideId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!rideId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: "Missing required payment verification fields" });
        }

        const result = await confirmPayment(
            parseInt(rideId),
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        res.status(200).json(result);
    } catch (error: any) {
        console.error("Error verifying payment:", error);
        res.status(400).json({ message: error.message || "Payment verification failed" });
    }
};

/**
 * Initialize payout account for captain
 */
export const initializeCaptainPayout = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const accountId = await createCaptainConnectAccount(userId);
        const onboardingUrl = await getCaptainOnboardingLink(userId);

        res.status(200).json({
            accountId,
            onboardingUrl,
            message: "Payout account initialized. Complete the setup to receive payouts."
        });
    } catch (error: any) {
        console.error("Error initializing captain payout:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

// Alias for backward compatibility
export const initializeCaptainStripe = initializeCaptainPayout;

/**
 * Get captain's payout account status
 */
export const getCaptainPayoutStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const status = await checkCaptainAccountStatus(userId);
        res.status(200).json(status);
    } catch (error: any) {
        console.error("Error checking captain payout status:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

// Alias for backward compatibility
export const getCaptainStripeStatus = getCaptainPayoutStatus;

/**
 * Get captain's onboarding/setup link
 */
export const getCaptainOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const onboardingUrl = await getCaptainOnboardingLink(userId);
        res.status(200).json({ onboardingUrl });
    } catch (error: any) {
        console.error("Error getting onboarding link:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

/**
 * Get captain's wallet summary
 */
export const getCaptainWallet = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const wallet = await getWalletSummary(userId);
        res.status(200).json({ wallet });
    } catch (error: any) {
        console.error("Error fetching wallet:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

/**
 * Request withdrawal from wallet
 */
export const createWithdrawal = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { amount } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Valid withdrawal amount is required" });
        }

        const result = await requestWithdrawal(userId, amount);
        res.status(200).json({
            message: "Withdrawal request processed successfully",
            ...result
        });
    } catch (error: any) {
        console.error("Error processing withdrawal:", error);
        res.status(400).json({ message: error.message || "Failed to process withdrawal" });
    }
};

/**
 * Get withdrawal history
 */
export const getWithdrawals = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const withdrawals = await getWithdrawalHistory(userId);
        res.status(200).json({ withdrawals });
    } catch (error: any) {
        console.error("Error fetching withdrawals:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
};

// Legacy exports for backward compatibility
export const getSetupIntent = async (req: AuthRequest, res: Response) => {
    // Razorpay doesn't need setup intents - redirect to create order
    res.status(200).json({ 
        message: "Use /payment/order endpoint to create a payment order",
        deprecated: true 
    });
};

export const getUserPaymentMethods = async (req: AuthRequest, res: Response) => {
    // Razorpay saved cards require token-based approach
    res.status(200).json({ 
        paymentMethods: [],
        message: "Saved payment methods feature uses Razorpay tokens"
    });
};

export const removePaymentMethod = async (req: AuthRequest, res: Response) => {
    res.status(200).json({ message: "Payment method management not implemented for Razorpay" });
};
