import { Router } from "express";
import rideRoutes from '../v1/rideRoutes';
import captainRoutes from '../v1/captainRoutes';
import authRoutes from '../v1/authRoutes';
import reviewRoutes from '../v1/reviewRoutes';
import mapRoutes from '../v1/mapRoutes';
import profileRoutes from '../v1/profileRoutes';
import chatRoutes from '../v1/chatRoutes';
import documentRoutes from '../v1/documentRoutes';
import adminRoutes from '../v1/adminRoutes';
import sosRoutes from '../v1/sosRoutes';
import paymentRoutes from '../v1/paymentRoutes';
import notificationRoutes from '../v1/notificationRoutes';
import biddingRoutes from '../v1/biddingRoutes';
import heatmapRoutes from '../v1/heatmapRoutes';
import rideSharingRoutes from '../v1/rideSharingRoutes';

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