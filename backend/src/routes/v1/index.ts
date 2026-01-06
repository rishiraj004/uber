import { Router } from "express";
import rideRoutes from '../v1/rideRoutes';
import captainRoutes from '../v1/captainRoutes';
import authRoutes from '../v1/authRoutes';

const router = Router();

router.use('/ride', rideRoutes);
router.use('/captain', captainRoutes);
router.use('/auth', authRoutes);

export default router;