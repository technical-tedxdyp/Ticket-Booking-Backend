import Razorpay from 'razorpay';

export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const createOrder = async (amountInRupees, receipt) => {
    return await razorpay.orders.create({
        amount: amountInRupees * 100,
        currency: 'INR',
        receipt,
        payment_capture: 1,
    });
}
