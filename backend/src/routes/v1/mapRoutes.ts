import { Router } from "express";
import { addressSuggestions, getDirections } from "../../controllers/mapController";
import { authenticate } from "../../middlewares/authMiddelwares";

const router = Router();

// Get address suggestions (authenticated)
router.get('/address-suggestions', authenticate, addressSuggestions);

// Get directions between two points (authenticated)
router.get('/directions', authenticate, getDirections);

export default router;
