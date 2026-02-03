import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// You need to set FIREBASE_SERVICE_ACCOUNT_KEY env variable with the path to your service account JSON
// Or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY individually

const initializeFirebase = () => {
    if (admin.apps.length > 0) {
        return admin;
    }

    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            // Initialize with service account file path
            const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            // Initialize with individual environment variables
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
        } else {
            console.warn('Firebase credentials not configured. Push notifications will be disabled.');
            return null;
        }
        console.log('Firebase Admin initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Firebase Admin:', error);
        return null;
    }

    return admin;
};

const firebaseAdmin = initializeFirebase();

export default firebaseAdmin;
