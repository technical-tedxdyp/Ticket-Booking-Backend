import crypto from 'crypto';
import Razorpay from 'razorpay';
import ApiError from '../utils/ApiError.js';

export const isRazorpayEnabled = () => {
    return String(process.env.IS_RAZOR_PAY_ENABLE || 'false').toLowerCase() === 'true';
};

const createRazorpayClient = () => {
    if (!isRazorpayEnabled()) {
        return null;
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new ApiError(500, 'Razorpay is enabled but credentials are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable it again.');
    }

    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
};

export const razorpay = createRazorpayClient();

// Create Razorpay Order
export const createOrder = async (amountInRupees, receipt) => {
    if (!isRazorpayEnabled() || !razorpay) {
        throw new ApiError(503, 'Razorpay payments are temporarily disabled. Set IS_RAZOR_PAY_ENABLE=true and add valid keys to enable them again.');
    }

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

const normalizeHexSignature = (signature) =>
    String(signature || '')
        .trim()
        .toLowerCase();

// Verify Razorpay Payment Signature
export const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
    if (!isRazorpayEnabled() || !process.env.RAZORPAY_KEY_SECRET || !razorpaySignature) {
        return false;
    }

    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');

    const normalizedExpected = normalizeHexSignature(expectedSignature);
    const normalizedReceived = normalizeHexSignature(razorpaySignature);

    if (normalizedExpected.length !== normalizedReceived.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(Buffer.from(normalizedExpected), Buffer.from(normalizedReceived));
    } catch (error) {
        return false;
    }
};

// Verify Razorpay Webhook Signature
export const verifyWebhookSignature = (rawBody, receivedSignature) => {
    if (!isRazorpayEnabled() || !process.env.RAZORPAY_WEBHOOK_SECRET || !receivedSignature) {
        return false;
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(bodyBuffer).digest('hex');

    const normalizedReceived = normalizeHexSignature(receivedSignature);
    const normalizedExpected = normalizeHexSignature(expectedSignature);

    if (normalizedExpected.length !== normalizedReceived.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(Buffer.from(normalizedExpected), Buffer.from(normalizedReceived));
    } catch (error) {
        return false;
    }
};

// Fetch Payment Details
export const fetchPayment = async (paymentId) => {
    if (!isRazorpayEnabled() || !razorpay) {
        throw new ApiError(503, 'Razorpay payments are temporarily disabled. Set IS_RAZOR_PAY_ENABLE=true and add valid keys to enable them again.');
    }

    try {
        return await razorpay.payments.fetch(paymentId);
    } catch (error) {
        throw new ApiError(404, 'Payment not found.');
    }
};

// Fetch Order Details
export const fetchOrder = async (orderId) => {
    if (!isRazorpayEnabled() || !razorpay) {
        throw new ApiError(503, 'Razorpay payments are temporarily disabled. Set IS_RAZOR_PAY_ENABLE=true and add valid keys to enable them again.');
    }

    try {
        return await razorpay.orders.fetch(orderId);
    } catch (error) {
        throw new ApiError(404, 'Order not found.');
    }
};
