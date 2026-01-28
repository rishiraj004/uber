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

export default router;