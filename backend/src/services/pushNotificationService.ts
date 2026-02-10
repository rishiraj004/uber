import firebaseAdmin from '../config/firebase.js';
import prisma from '../config/prisma.js';

type NotificationType = 
    | 'RIDE_ACCEPTED'
    | 'CAPTAIN_ARRIVED'
    | 'RIDE_STARTED'
    | 'RIDE_COMPLETED'
    | 'RIDE_CANCELLED'
    | 'NEW_RIDE_REQUEST'
    | 'NEW_CHAT_MESSAGE'
    | 'PAYMENT_CAPTURED'
    | 'WITHDRAWAL_COMPLETED'
    | 'SOS_ALERT'
    | 'DOCUMENT_EXPIRED'
    | 'DOCUMENT_EXPIRING';

interface NotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

const notificationTemplates: Record<NotificationType, (data: any) => NotificationPayload> = {
    RIDE_ACCEPTED: (data) => ({
        title: 'Ride Accepted! 🚗',
        body: `${data.captainName} is on the way to pick you up.`,
        data: { rideId: String(data.rideId), type: 'RIDE_ACCEPTED' }
    }),
    CAPTAIN_ARRIVED: (data) => ({
        title: 'Captain has arrived! 📍',
        body: 'Your captain is waiting at the pickup location.',
        data: { rideId: String(data.rideId), type: 'CAPTAIN_ARRIVED' }
    }),
    RIDE_STARTED: (data) => ({
        title: 'Ride Started 🚀',
        body: 'Your ride has begun. Enjoy the trip!',
        data: { rideId: String(data.rideId), type: 'RIDE_STARTED' }
    }),
    RIDE_COMPLETED: (data) => ({
        title: 'Ride Completed! ✅',
        body: `Total fare: ₹${data.fare}. Thank you for riding with us!`,
        data: { rideId: String(data.rideId), type: 'RIDE_COMPLETED', fare: String(data.fare) }
    }),
    RIDE_CANCELLED: (data) => ({
        title: 'Ride Cancelled',
        body: data.message || 'The ride has been cancelled.',
        data: { rideId: String(data.rideId), type: 'RIDE_CANCELLED' }
    }),
    NEW_RIDE_REQUEST: (data) => ({
        title: 'New Ride Request! 🔔',
        body: `${data.pickupAddress} → ${data.dropoffAddress} | ₹${data.fare}`,
        data: { 
            rideId: String(data.rideId), 
            type: 'NEW_RIDE_REQUEST',
            fare: String(data.fare),
            pickupAddress: data.pickupAddress,
            dropoffAddress: data.dropoffAddress
        }
    }),
    NEW_CHAT_MESSAGE: (data) => ({
        title: `Message from ${data.senderName}`,
        body: data.message.length > 50 ? data.message.substring(0, 50) + '...' : data.message,
        data: { rideId: String(data.rideId), type: 'NEW_CHAT_MESSAGE' }
    }),
    PAYMENT_CAPTURED: (data) => ({
        title: 'Payment Successful 💳',
        body: `₹${data.amount} has been charged for your ride.`,
        data: { rideId: String(data.rideId), type: 'PAYMENT_CAPTURED', amount: String(data.amount) }
    }),
    WITHDRAWAL_COMPLETED: (data) => ({
        title: 'Withdrawal Successful! 💰',
        body: `₹${data.amount} has been transferred to your bank account.`,
        data: { type: 'WITHDRAWAL_COMPLETED', amount: String(data.amount) }
    }),
    SOS_ALERT: (data) => ({
        title: '🚨 SOS Alert!',
        body: `Emergency alert triggered for ride #${data.rideId}`,
        data: { rideId: String(data.rideId), type: 'SOS_ALERT' }
    }),
    DOCUMENT_EXPIRED: (data) => ({
        title: 'Documents Expired! ⚠️',
        body: data.documentType === 'LICENSE' 
            ? 'Your driving license has expired. Please update your documents to continue driving.'
            : 'Your vehicle registration has expired. Please update your documents to continue driving.',
        data: { type: 'DOCUMENT_EXPIRED', documentType: data.documentType }
    }),
    DOCUMENT_EXPIRING: (data) => ({
        title: 'License Expiring Soon ⏰',
        body: `Your driving license will expire in ${data.daysLeft} days. Please renew it to avoid service interruption.`,
        data: { type: 'DOCUMENT_EXPIRING', documentType: data.documentType, daysLeft: String(data.daysLeft) }
    })
};

/**
 * Send push notification to a specific user
 */
export const sendPushNotification = async (
    userId: number,
    type: NotificationType,
    data: any
): Promise<boolean> => {
    if (!firebaseAdmin) {
        console.log('Firebase not configured, skipping push notification');
        return false;
    }

    try {
        // Get user's FCM token
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fcmToken: true, fullName: true }
        });

        if (!user?.fcmToken) {
            console.log(`No FCM token for user ${userId}, skipping push notification`);
            return false;
        }

        // Get notification template
        const template = notificationTemplates[type];
        if (!template) {
            console.error(`Unknown notification type: ${type}`);
            return false;
        }

        const payload = template(data);

        // Send notification via FCM
        const message = {
            token: user.fcmToken,
            notification: {
                title: payload.title,
                body: payload.body
            },
            data: payload.data,
            android: {
                priority: 'high' as const,
                notification: {
                    sound: 'default',
                    channelId: 'uber_rides'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            }
        };

        const response = await firebaseAdmin.messaging().send(message);
        console.log(`Push notification sent successfully to user ${userId}:`, response);
        return true;
    } catch (error: any) {
        // Handle invalid token - remove it from database
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            console.log(`Removing invalid FCM token for user ${userId}`);
            await prisma.user.update({
                where: { id: userId },
                data: { fcmToken: null }
            });
        }
        console.error(`Failed to send push notification to user ${userId}:`, error);
        return false;
    }
};

/**
 * Send push notification to multiple users
 */
export const sendPushNotificationToMultiple = async (
    userIds: number[],
    type: NotificationType,
    data: any
): Promise<{ success: number; failed: number }> => {
    let success = 0;
    let failed = 0;

    await Promise.all(
        userIds.map(async (userId) => {
            const result = await sendPushNotification(userId, type, data);
            if (result) {
                success++;
            } else {
                failed++;
            }
        })
    );

    return { success, failed };
};

/**
 * Update user's FCM token
 */
export const updateFcmToken = async (userId: number, fcmToken: string): Promise<void> => {
    await prisma.user.update({
        where: { id: userId },
        data: { fcmToken }
    });
};

/**
 * Remove user's FCM token (on logout)
 */
export const removeFcmToken = async (userId: number): Promise<void> => {
    await prisma.user.update({
        where: { id: userId },
        data: { fcmToken: null }
    });
};

/**
 * Send notification to all admins (for SOS alerts)
 */
export const notifyAllAdmins = async (type: NotificationType, data: any): Promise<void> => {
    const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', fcmToken: { not: null } },
        select: { id: true }
    });

    if (admins.length > 0) {
        await sendPushNotificationToMultiple(admins.map(a => a.id), type, data);
    }
};
