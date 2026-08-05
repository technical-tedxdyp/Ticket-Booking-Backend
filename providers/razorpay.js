import crypto from 'crypto';
import Razorpay from 'razorpay';
import ApiError from '../utils/ApiError.js';

export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay Order
export const createOrder = async (amountInRupees, receipt) => {
    try {
        return await razorpay.orders.create({
            amount: amountInRupees * 100,
            currency: 'INR',
            receipt,
        });
    } catch (error) {
        throw new ApiError(500, 'Unable to create Razorpay order.');
    }
};

// Verify Razorpay Payment Signature
export const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;

    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');

    return expectedSignature === razorpaySignature;
};

// Verify Razorpay Webhook Signature
export const verifyWebhookSignature = (rawBody, receivedSignature) => {
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');

    return expectedSignature === receivedSignature;
};

// Fetch Payment Details
export const fetchPayment = async (paymentId) => {
    try {
        return await razorpay.payments.fetch(paymentId);
    } catch (error) {
        throw new ApiError(404, 'Payment not found.');
    }
};

// Fetch Order Details
export const fetchOrder = async (orderId) => {
    try {
        return await razorpay.orders.fetch(orderId);
    } catch (error) {
        throw new ApiError(404, 'Order not found.');
    }
};
