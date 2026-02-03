import { findNearbyCaptains } from "./mapService";
import { userData } from "./getProfileService";
import { calculateRideFare, calculateAllFareOptions, vehicleClassInfo } from "./rideService";
import { calculateSurgeMultiplier, getSurgeInfo, getSurgeHeatmapData } from "./surgeService";
import { 
    authorizePayment, 
    capturePayment, 
    cancelPayment, 
    getOrCreateRazorpayCustomer,
    getOrCreateStripeCustomer, // Alias for backward compatibility
    getWalletSummary,
    requestWithdrawal,
    createRazorpayOrder,
    confirmPayment,
    getRazorpayKey
} from "./paymentService";
import { sendPushNotification, updateFcmToken, removeFcmToken } from "./pushNotificationService";

export {
    findNearbyCaptains,
    userData,
    calculateRideFare,
    calculateAllFareOptions,
    vehicleClassInfo,
    calculateSurgeMultiplier,
    getSurgeInfo,
    getSurgeHeatmapData,
    authorizePayment,
    capturePayment,
    cancelPayment,
    getOrCreateRazorpayCustomer,
    getOrCreateStripeCustomer,
    getWalletSummary,
    requestWithdrawal,
    createRazorpayOrder,
    confirmPayment,
    getRazorpayKey,
    sendPushNotification,
    updateFcmToken,
    removeFcmToken
};