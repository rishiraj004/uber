import { Router } from "express";
import rideRoutes from '../v1/rideRoutes';
import captainRoutes from '../v1/captainRoutes';
import authRoutes from '../v1/authRoutes';
import reviewRoutes from '../v1/reviewRoutes';
import mapRoutes from '../v1/mapRoutes';
import profileRoutes from '../v1/profileRoutes';
import chatRoutes from '../v1/chatRoutes';

const router = Router();

router.use('/ride', rideRoutes);
router.use('/captain', captainRoutes);
router.use('/auth', authRoutes);
router.use('/review', reviewRoutes);
router.use('/map', mapRoutes);
router.use('/profile', profileRoutes);
router.use('/chat', chatRoutes);

export default router;