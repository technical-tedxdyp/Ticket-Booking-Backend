import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';
import { createOrder } from '../providers/razorpay.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createPendingBooking, getBookingById } from '../services/booking.service.js';

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

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, 'Booking created successfully', {
            bookingId: booking._id,
            orderId: razorpayOrder.id,
            amount: totalAmount,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
        })
    );
});

export const getBookingDetails = asyncHandler(async (req, res) => {
    const { bookingId } = req.params;

    const booking = await getBookingById(bookingId);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Booking details fetched successfully', booking)
    );
});
