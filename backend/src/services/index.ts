import { findNearbyCaptains } from "./mapService.js";
import { userData } from "./getProfileService.js";
import { calculateRideFare, calculateAllFareOptions, vehicleClassInfo } from "./rideService.js";
import { calculateSurgeMultiplier, getSurgeInfo, getSurgeHeatmapData } from "./surgeService.js";
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
} from "./paymentService.js";
import { sendPushNotification, updateFcmToken, removeFcmToken } from "./pushNotificationService.js";

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