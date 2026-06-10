import { Router } from "express";
import { submitReview, getReviewsForUser, checkReviewStatus } from "../../controllers/reviewController.js";
import { authenticate } from "../../middlewares/authMiddlewares.js";

const router = Router();

router.post('/submit', authenticate, submitReview);
router.get('/user/:userId', authenticate, getReviewsForUser);
router.get('/status/:rideId', authenticate, checkReviewStatus);

export default router;
