import { Router } from "express";
import { addressSuggestions, getDirections, retrievePlaceDetails } from "../../controllers/mapController.js";
import { authenticate } from "../../middlewares/authMiddlewares.js";

const router = Router();

// Get address suggestions (authenticated)
router.get('/address-suggestions', authenticate, addressSuggestions);

// Retrieve full place details including coordinates (authenticated)
router.get('/retrieve-place', authenticate, retrievePlaceDetails);

// Get directions between two points (authenticated)
router.get('/directions', authenticate, getDirections);

export default router;
