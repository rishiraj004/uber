import v1ApiRoutes from './v1/index.js';
import { Router } from 'express';

const router = Router();

router.use('/v1', v1ApiRoutes);

export default router;