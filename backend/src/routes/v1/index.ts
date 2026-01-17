import { Router } from "express";
import rideRoutes from '../v1/rideRoutes';
import captainRoutes from '../v1/captainRoutes';
import authRoutes from '../v1/authRoutes';
import reviewRoutes from '../v1/reviewRoutes';
import mapRoutes from '../v1/mapRoutes';

const router = Router();

router.use('/ride', rideRoutes);
router.use('/captain', captainRoutes);
router.use('/auth', authRoutes);
router.use('/review', reviewRoutes);
router.use('/map', mapRoutes);

export default router;