import { Router } from "express";
import rideRoutes from '../v1/rideRoutes.js';
import captainRoutes from '../v1/captainRoutes.js';
import authRoutes from '../v1/authRoutes.js';
import reviewRoutes from '../v1/reviewRoutes.js';
import mapRoutes from '../v1/mapRoutes.js';
import profileRoutes from '../v1/profileRoutes.js';
import chatRoutes from '../v1/chatRoutes.js';
import documentRoutes from '../v1/documentRoutes.js';
import adminRoutes from '../v1/adminRoutes.js';
import sosRoutes from '../v1/sosRoutes.js';
import paymentRoutes from '../v1/paymentRoutes.js';
import notificationRoutes from '../v1/notificationRoutes.js';
import biddingRoutes from '../v1/biddingRoutes.js';
import heatmapRoutes from '../v1/heatmapRoutes.js';
import rideSharingRoutes from '../v1/rideSharingRoutes.js';

const router = Router();

router.use('/ride', rideRoutes);
router.use('/captain', captainRoutes);
router.use('/auth', authRoutes);
router.use('/review', reviewRoutes);
router.use('/map', mapRoutes);
router.use('/profile', profileRoutes);
router.use('/chat', chatRoutes);
router.use('/documents', documentRoutes);
router.use('/admin', adminRoutes);
router.use('/sos', sosRoutes);
router.use('/payment', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/bids', biddingRoutes);
router.use('/heatmap', heatmapRoutes);
router.use('/ride-sharing', rideSharingRoutes);

export default router;