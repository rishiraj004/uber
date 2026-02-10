import { signup, login, getProfile } from "./authController.js";
import { createRide, acceptRide, startRide, completeRide, calculateFare, cancelRide, getRidePath, getRideDetails, getRideHistory, getRideHistoryDetail } from "./rideController.js";
import { getCaptainStatus, toggleAvailability, getNearbyCaptains, updateLocation } from "./captainController.js";
import { submitReview, getReviewsForUser, checkReviewStatus } from "./reviewController.js";
import { updateRiderAddresses, getRiderAddresses, uploadCaptainDocument, getCaptainDocuments, getFullProfile } from "./profileController.js";
import { sendChatMessage, getChatMessages } from "./chatController.js";
import { 
    getSetupIntent, 
    getUserPaymentMethods, 
    removePaymentMethod, 
    initializeCaptainStripe,
    getCaptainStripeStatus,
    getCaptainOnboarding,
    getCaptainWallet,
    createWithdrawal,
    getWithdrawals 
} from "./paymentController.js";
import { registerFcmToken, unregisterFcmToken } from "./notificationController.js";

export {
    signup,
    login,
    getProfile,
    createRide,
    acceptRide,
    startRide,
    completeRide,
    calculateFare,
    cancelRide,
    getRidePath,
    getRideDetails,
    getRideHistory,
    getRideHistoryDetail,
    getCaptainStatus,
    toggleAvailability,
    getNearbyCaptains,
    updateLocation,
    submitReview,
    getReviewsForUser,
    checkReviewStatus,
    updateRiderAddresses,
    getRiderAddresses,
    uploadCaptainDocument,
    getCaptainDocuments,
    getFullProfile,
    sendChatMessage,
    getChatMessages,
    getSetupIntent,
    getUserPaymentMethods,
    removePaymentMethod,
    initializeCaptainStripe,
    getCaptainStripeStatus,
    getCaptainOnboarding,
    getCaptainWallet,
    createWithdrawal,
    getWithdrawals,
    registerFcmToken,
    unregisterFcmToken
};