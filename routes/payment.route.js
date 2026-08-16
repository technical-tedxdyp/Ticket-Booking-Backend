import express from 'express';
import { verifyPayment, razorpayWebhook } from '../controllers/payment.controller.js';
import validatePayment from '../validations/payment.validation.js';

const router = express.Router();

router.post('/verify', validatePayment, verifyPayment);
router.post('/webhook', razorpayWebhook);

export default router;
