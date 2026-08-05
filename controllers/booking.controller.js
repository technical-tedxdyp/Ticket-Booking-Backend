import { StatusCodes } from 'http-status-codes';
import { createOrder } from '../providers/razorpay.js';
import { successResponse } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createPendingBooking } from '../services/booking.service.js';

export const createBookingOrder = asyncHandler(async (req, res) => {
    const { name, email, phone, selectedSessions, ticketCount } = req.body;

    // Create Pending Booking
    const { booking, totalAmount } = await createPendingBooking({
        name,
        email,
        phone,
        selectedSessions,
        ticketCount,
    });

    // Razorpay
    const razorpayOrder = await createOrder(totalAmount, `booking_${booking._id}`);
    booking.razorpayOrderId = razorpayOrder.id;
    await booking.save();

    return successResponse(res, StatusCodes.CREATED, 'Booking created successfully', {
        bookingId: booking._id,
        orderId: razorpayOrder.id,
        amount: totalAmount,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
    });
});
