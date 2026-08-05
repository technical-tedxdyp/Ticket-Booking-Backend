import express from 'express';
import { verifyPayment, razorpayWebhook } from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/verify', verifyPayment);
router.post('/webhook', razorpayWebhook);

export default router;
