import { Router } from "express";
import validateBooking, { validateBookingId } from "../validations/booking.validation.js";
import { rateLimitMiddleware } from '../middlewares/rateLimiter.js';
import { createBookingOrder, getBookingDetails } from '../controllers/booking.controller.js';

const router = Router();

router.post('/create-order', rateLimitMiddleware, validateBooking, createBookingOrder);
router.get('/:bookingId', validateBookingId, getBookingDetails);

export default router;
