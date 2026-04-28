import { Router } from "express";
import validateBooking from '../middlewares/validateBooking.js';
import { rateLimitMiddleware } from '../middlewares/rateLimiter.js';
import { createBookingOrder } from '../controllers/booking.controller.js';

const router = Router();

router.post('/create-order', rateLimitMiddleware, validateBooking, createBookingOrder);

export default router;
