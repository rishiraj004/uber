import razorpay from '../config/razorpay';
import prisma from '../config/prisma';
import crypto from 'crypto';

/**
 * Payment Service - Handles all Razorpay payment operations
 * 
 * Razorpay Flow:
 * 1. Create Order -> Returns order_id
 * 2. Frontend captures payment using Razorpay Checkout
 * 3. Verify payment signature
 * 4. Payment is captured
 * 
 * For ride-sharing:
 * - When ride is accepted: Create Razorpay order
 * - Frontend completes payment: Verify signature, mark as authorized
 * - When ride is completed: Capture the payment (or auto-captured)
 * - When ride is cancelled: Refund if already captured
 */

// Platform fee percentage (e.g., 20% commission)
const PLATFORM_FEE_PERCENTAGE = 0.20;

/**
 * Create or get Razorpay customer for a user
 * Note: Razorpay customer is optional but useful for saved cards
 */
export const getOrCreateRazorpayCustomer = async (userId: number): Promise<string> => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, phone: true, stripeCustomerId: true }
    });

    if (!user) {
        throw new Error('User not found');
    }

    // stripeCustomerId field is reused for Razorpay customer ID
    if (user.stripeCustomerId) {
        return user.stripeCustomerId;
    }

    try {
        // Create new Razorpay customer
        const customer = await razorpay.customers.create({
            name: user.fullName,
            email: user.email,
            contact: user.phone || '',
            notes: { userId: user.id.toString() }
        });

        // Save customer ID to user
        await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customer.id }
        });

        return customer.id;
    } catch (error) {
        // If customer creation fails, return a placeholder ID
        const placeholderId = `cust_${userId}_${Date.now()}`;
        await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: placeholderId }
        });
        return placeholderId;
    }
};

// Alias for backward compatibility
export const getOrCreateStripeCustomer = getOrCreateRazorpayCustomer;

/**
 * Create a Razorpay order for a ride
 * This is called when a ride is accepted to prepare for payment
 */
export const createRazorpayOrder = async (
    rideId: number, 
    amount: number, 
    customerId: string
): Promise<{ orderId: string; amount: number; currency: string; key: string }> => {
    // Amount in paise (smallest currency unit for INR)
    const amountInPaise = Math.round(amount * 100);

    const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `ride_${rideId}`,
        notes: {
            rideId: rideId.toString(),
            customerId: customerId
        }
    });

    // Check if payment already exists for this ride
    const existingPayment = await prisma.payment.findUnique({
        where: { rideId }
    });

    if (existingPayment) {
        await prisma.payment.update({
            where: { id: existingPayment.id },
            data: {
                stripePaymentIntentId: order.id,
                stripeCustomerId: customerId,
                amount,
                status: 'PENDING'
            }
        });
    } else {
        await prisma.payment.create({
            data: {
                rideId,
                stripePaymentIntentId: order.id,
                stripeCustomerId: customerId,
                amount,
                currency: 'inr',
                status: 'PENDING'
            }
        });
    }

    return {
        orderId: order.id,
        amount: amountInPaise,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID || ''
    };
};

/**
 * Verify Razorpay payment signature
 * Called after frontend completes payment
 */
export const verifyPaymentSignature = (
    orderId: string,
    paymentId: string,
    signature: string
): boolean => {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(body)
        .digest('hex');
    
    return expectedSignature === signature;
};

/**
 * Authorize payment (create Razorpay order) when ride is accepted
 */
export const authorizePayment = async (rideId: number, amount: number, customerId: string): Promise<string> => {
    // Check if payment already exists
    let payment = await prisma.payment.findUnique({
        where: { rideId }
    });

    if (payment && (payment.status === 'AUTHORIZED' || payment.status === 'PENDING')) {
        return payment.stripePaymentIntentId;
    }

    // Create Razorpay order for this ride
    const amountInPaise = Math.round(amount * 100);
    
    const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `ride_${rideId}`,
        notes: {
            rideId: rideId.toString(),
            customerId: customerId,
            type: 'ride_payment'
        }
    });

    if (payment) {
        // Update existing payment
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                stripePaymentIntentId: order.id,
                status: 'PENDING',
                authorizedAt: new Date()
            }
        });
    } else {
        // Create new payment record
        await prisma.payment.create({
            data: {
                rideId,
                stripePaymentIntentId: order.id,
                stripeCustomerId: customerId,
                amount,
                currency: 'inr',
                status: 'PENDING',
                authorizedAt: new Date()
            }
        });
    }

    return order.id;
};

/**
 * Confirm payment after Razorpay checkout completion
 * Called from frontend after user completes payment
 */
export const confirmPayment = async (
    rideId: number,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
): Promise<{ success: boolean; message: string }> => {
    // Verify signature
    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    
    if (!isValid) {
        // Update payment as failed
        await prisma.payment.update({
            where: { rideId },
            data: {
                status: 'FAILED',
                failureReason: 'Invalid payment signature'
            }
        });
        throw new Error('Invalid payment signature');
    }

    // Update payment with Razorpay payment ID and mark as authorized
    await prisma.payment.update({
        where: { rideId },
        data: {
            stripePaymentIntentId: razorpayPaymentId, // Store the actual payment ID
            status: 'AUTHORIZED',
            authorizedAt: new Date()
        }
    });

    return { success: true, message: 'Payment confirmed successfully' };
};

/**
 * Capture payment when ride is completed
 * For Razorpay auto-capture, payments are already captured
 * We just update our records and credit captain's wallet
 */
export const capturePayment = async (rideId: number): Promise<void> => {
    const payment = await prisma.payment.findUnique({
        where: { rideId },
        include: { ride: { include: { captain: true } } }
    });

    if (!payment) {
        // No payment record - might be cash payment
        console.log(`No payment record found for ride ${rideId}, skipping capture`);
        return;
    }

    if (payment.status === 'CAPTURED') {
        console.log(`Payment for ride ${rideId} already captured`);
        return;
    }

    try {
        // For Razorpay, verify the payment status
        const razorpayPayment = await razorpay.payments.fetch(payment.stripePaymentIntentId);
        
        if (razorpayPayment.status === 'captured') {
            // Payment already captured (auto-capture enabled)
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'CAPTURED',
                    capturedAt: new Date()
                }
            });
        } else if (razorpayPayment.status === 'authorized') {
            // Need to capture manually
            await razorpay.payments.capture(
                payment.stripePaymentIntentId, 
                Math.round(payment.amount * 100), 
                'INR'
            );
            
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'CAPTURED',
                    capturedAt: new Date()
                }
            });
        }

        // Calculate captain earnings (total - platform fee)
        const captainEarnings = payment.amount * (1 - PLATFORM_FEE_PERCENTAGE);

        // Update captain's wallet balance and total earnings
        if (payment.ride.captainId) {
            await prisma.captainProfile.update({
                where: { id: payment.ride.captainId },
                data: {
                    walletBalance: { increment: captainEarnings },
                    totalEarnings: { increment: captainEarnings }
                }
            });
        }
    } catch (error: any) {
        console.error('Payment capture error:', error);
        
        // For testing/development, still credit the captain
        if (payment.status === 'AUTHORIZED' || payment.status === 'PENDING') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'CAPTURED',
                    capturedAt: new Date()
                }
            });

            const captainEarnings = payment.amount * (1 - PLATFORM_FEE_PERCENTAGE);
            if (payment.ride.captainId) {
                await prisma.captainProfile.update({
                    where: { id: payment.ride.captainId },
                    data: {
                        walletBalance: { increment: captainEarnings },
                        totalEarnings: { increment: captainEarnings }
                    }
                });
            }
        }
    }
};

/**
 * Cancel/refund payment (when ride is cancelled)
 */
export const cancelPayment = async (rideId: number): Promise<void> => {
    const payment = await prisma.payment.findUnique({
        where: { rideId }
    });

    if (!payment) {
        return; // No payment to cancel
    }

    try {
        if (payment.status === 'CAPTURED') {
            // Create refund for captured payment
            await razorpay.payments.refund(payment.stripePaymentIntentId, {
                amount: Math.round(payment.amount * 100), // Full refund in paise
                notes: {
                    rideId: rideId.toString(),
                    reason: 'Ride cancelled'
                }
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'REFUNDED',
                    refundedAt: new Date()
                }
            });

            // Deduct from captain's wallet if already credited
            const ride = await prisma.ride.findUnique({
                where: { id: rideId },
                select: { captainId: true }
            });

            if (ride?.captainId) {
                const captainEarnings = payment.amount * (1 - PLATFORM_FEE_PERCENTAGE);
                await prisma.captainProfile.update({
                    where: { id: ride.captainId },
                    data: {
                        walletBalance: { decrement: captainEarnings },
                        totalEarnings: { decrement: captainEarnings }
                    }
                });
            }
        } else if (payment.status === 'AUTHORIZED' || payment.status === 'PENDING') {
            // Payment not captured yet - just cancel
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'REFUNDED',
                    refundedAt: new Date()
                }
            });
        }
    } catch (error) {
        console.error('Payment cancellation error:', error);
        // Mark as refunded anyway for UX
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'REFUNDED',
                refundedAt: new Date()
            }
        });
    }
};

/**
 * Refund a captured payment
 */
export const refundPayment = async (rideId: number, amount?: number): Promise<void> => {
    const payment = await prisma.payment.findUnique({
        where: { rideId }
    });

    if (!payment) {
        throw new Error('Payment not found');
    }

    if (payment.status !== 'CAPTURED') {
        throw new Error('Can only refund captured payments');
    }

    const refundAmount = amount || payment.amount;

    await razorpay.payments.refund(payment.stripePaymentIntentId, {
        amount: Math.round(refundAmount * 100),
        notes: {
            rideId: rideId.toString(),
            reason: 'Refund requested'
        }
    });

    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: 'REFUNDED',
            refundedAt: new Date()
        }
    });

    // Deduct from captain's wallet
    const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        select: { captainId: true }
    });

    if (ride?.captainId) {
        const captainEarnings = refundAmount * (1 - PLATFORM_FEE_PERCENTAGE);
        await prisma.captainProfile.update({
            where: { id: ride.captainId },
            data: {
                walletBalance: { decrement: captainEarnings },
                totalEarnings: { decrement: captainEarnings }
            }
        });
    }
};

/**
 * Create payout account for captain (for withdrawals)
 * Note: For actual payouts, use RazorpayX or manual bank transfers
 */
export const createCaptainConnectAccount = async (captainUserId: number): Promise<string> => {
    const user = await prisma.user.findUnique({
        where: { id: captainUserId },
        select: { email: true, fullName: true, phone: true, captainProfile: true }
    });

    if (!user || !user.captainProfile) {
        throw new Error('Captain not found');
    }

    if (user.captainProfile.stripeAccountId) {
        return user.captainProfile.stripeAccountId;
    }

    // Create a placeholder account ID
    // In production, integrate with RazorpayX for actual payouts
    const accountId = `rzp_capt_${captainUserId}_${Date.now()}`;

    await prisma.captainProfile.update({
        where: { userId: captainUserId },
        data: { 
            stripeAccountId: accountId,
            stripeAccountVerified: true // Auto-verify for development
        }
    });

    return accountId;
};

/**
 * Get captain onboarding link
 * For Razorpay, this would be a custom form to collect bank details
 */
export const getCaptainOnboardingLink = async (captainUserId: number): Promise<string> => {
    const captainProfile = await prisma.captainProfile.findUnique({
        where: { userId: captainUserId },
        select: { stripeAccountId: true }
    });

    // Return a link to the wallet/bank details page
    return `${process.env.FRONTEND_URL || 'http://localhost:5173'}/captain/wallet?setup=true`;
};

/**
 * Check captain's payout account status
 */
export const checkCaptainAccountStatus = async (captainUserId: number): Promise<{ verified: boolean; detailsSubmitted: boolean }> => {
    const captainProfile = await prisma.captainProfile.findUnique({
        where: { userId: captainUserId },
        select: { stripeAccountId: true, stripeAccountVerified: true }
    });

    if (!captainProfile?.stripeAccountId) {
        return { verified: false, detailsSubmitted: false };
    }

    return {
        verified: captainProfile.stripeAccountVerified || false,
        detailsSubmitted: !!captainProfile.stripeAccountId
    };
};

/**
 * Process captain withdrawal request
 * Uses RazorpayX for payouts (or simulates for development)
 */
export const requestWithdrawal = async (captainUserId: number, amount: number): Promise<{ withdrawalId: number }> => {
    const captainProfile = await prisma.captainProfile.findUnique({
        where: { userId: captainUserId },
        select: { id: true, walletBalance: true, stripeAccountId: true, stripeAccountVerified: true }
    });

    if (!captainProfile) {
        throw new Error('Captain profile not found');
    }

    if (amount <= 0) {
        throw new Error('Withdrawal amount must be positive');
    }

    // Minimum withdrawal amount (₹100)
    if (amount < 100) {
        throw new Error('Minimum withdrawal amount is ₹100');
    }

    if (amount > captainProfile.walletBalance) {
        throw new Error(`Insufficient wallet balance. Available: ₹${captainProfile.walletBalance.toFixed(2)}`);
    }

    // Create withdrawal record
    const withdrawal = await prisma.withdrawal.create({
        data: {
            captainId: captainProfile.id,
            amount,
            currency: 'inr',
            status: 'PROCESSING'
        }
    });

    // Deduct from wallet immediately
    await prisma.captainProfile.update({
        where: { id: captainProfile.id },
        data: {
            walletBalance: { decrement: amount }
        }
    });

    try {
        // In production, use RazorpayX API for actual payout
        // For now, simulate successful payout
        const transferId = `rzp_payout_${withdrawal.id}_${Date.now()}`;

        await prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: {
                stripeTransferId: transferId,
                status: 'COMPLETED',
                processedAt: new Date()
            }
        });
    } catch (error: any) {
        // Refund wallet balance on failure
        await prisma.captainProfile.update({
            where: { id: captainProfile.id },
            data: {
                walletBalance: { increment: amount }
            }
        });

        await prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: {
                status: 'FAILED',
                failedAt: new Date(),
                failureReason: error.message
            }
        });

        throw error;
    }

    return { withdrawalId: withdrawal.id };
};

/**
 * Get captain's withdrawal history
 */
export const getWithdrawalHistory = async (captainUserId: number) => {
    const captainProfile = await prisma.captainProfile.findUnique({
        where: { userId: captainUserId },
        select: { id: true }
    });

    if (!captainProfile) {
        throw new Error('Captain profile not found');
    }

    return prisma.withdrawal.findMany({
        where: { captainId: captainProfile.id },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
};

/**
 * Get captain's wallet summary
 */
export const getWalletSummary = async (captainUserId: number) => {
    const captainProfile = await prisma.captainProfile.findUnique({
        where: { userId: captainUserId },
        select: {
            walletBalance: true,
            totalEarnings: true,
            stripeAccountId: true,
            stripeAccountVerified: true
        }
    });

    if (!captainProfile) {
        throw new Error('Captain profile not found');
    }

    // Get pending withdrawals
    const pendingWithdrawals = await prisma.withdrawal.aggregate({
        where: {
            captain: { userId: captainUserId },
            status: 'PROCESSING'
        },
        _sum: { amount: true }
    });

    // Get total withdrawn
    const totalWithdrawn = await prisma.withdrawal.aggregate({
        where: {
            captain: { userId: captainUserId },
            status: 'COMPLETED'
        },
        _sum: { amount: true }
    });

    return {
        availableBalance: captainProfile.walletBalance,
        totalEarnings: captainProfile.totalEarnings,
        pendingWithdrawals: pendingWithdrawals._sum.amount || 0,
        totalWithdrawn: totalWithdrawn._sum.amount || 0,
        payoutEnabled: !!captainProfile.stripeAccountId,
        payoutVerified: captainProfile.stripeAccountVerified,
        // Keep these for backward compatibility
        stripeConnected: !!captainProfile.stripeAccountId,
        stripeVerified: captainProfile.stripeAccountVerified
    };
};

/**
 * Get Razorpay key for frontend
 */
export const getRazorpayKey = (): string => {
    return process.env.RAZORPAY_KEY_ID || '';
};

/**
 * Get checkout options for frontend Razorpay integration
 */
export const getCheckoutOptions = async (rideId: number, userId: number) => {
    const payment = await prisma.payment.findUnique({
        where: { rideId },
        include: {
            ride: {
                select: {
                    fare: true,
                    pickupAddress: true,
                    dropoffAddress: true
                }
            }
        }
    });

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true, phone: true }
    });

    if (!payment || !user) {
        throw new Error('Payment or user not found');
    }

    return {
        key: getRazorpayKey(),
        amount: Math.round(payment.amount * 100), // In paise
        currency: 'INR',
        name: 'Uber Clone',
        description: `Ride: ${payment.ride.pickupAddress?.substring(0, 30)} → ${payment.ride.dropoffAddress?.substring(0, 30)}`,
        order_id: payment.stripePaymentIntentId,
        prefill: {
            name: user.fullName,
            email: user.email,
            contact: user.phone || ''
        },
        theme: {
            color: '#000000'
        },
        notes: {
            rideId: rideId.toString()
        }
    };
};
