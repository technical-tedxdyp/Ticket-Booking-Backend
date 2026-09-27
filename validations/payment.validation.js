import { z } from 'zod';

const paymentSchema = z.object({
    bookingId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid booking ID format.'),
    razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]+$/, 'Invalid Razorpay order ID format.'),
    razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/, 'Invalid Razorpay payment ID format.'),
    razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid Razorpay signature format.'),
});

const validatePayment = (req, res, next) => {
    try {
        const validatedData = paymentSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: error.errors.map((detail) => detail.message),
            });
        }
        next(error);
    }
};

export default validatePayment;
