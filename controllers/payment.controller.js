import ApiError from '../utils/ApiError.js';
import Booking from '../models/booking.model.js';
import { StatusCodes } from 'http-status-codes';
import { BOOKING_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateTicket } from '../services/ticket.service.js';
import { sendTicketEmail } from '../services/resend.service.js';
import { uploadTicketPDF } from '../services/cloudinary.service.js';

export const processBookingCompletion = async (booking) => {
    // 1. Generate ticket PDF and QR code
    const ticketResult = await generateTicket(booking);

    booking.ticketId = ticketResult.ticketId;
    booking.ticketGeneratedAt = new Date();

    // 2. Upload to Cloudinary
    let pdfUrl = booking.pdfUrl || null;
    if (process.env.CLOUDINARY_CLOUD_NAME && ticketResult.pdfBuffer) {
        try {
            const uploadRes = await uploadTicketPDF(ticketResult.pdfBuffer, ticketResult.ticketId);
            pdfUrl = uploadRes.secureUrl;
            booking.pdfUrl = pdfUrl;
        } catch (err) {
            console.error('Cloudinary upload error (non-fatal):', err.message);
        }
    }

    if (ticketResult.qrCodeBuffer) {
        booking.qrCode = `data:image/png;base64,${ticketResult.qrCodeBuffer.toString('base64')}`;
    }

    booking.bookingStatus = BOOKING_STATUS.TICKET_GENERATED;
    await booking.save();

    // 3. Send Ticket Email via Resend with PDF attachment & event details
    try {
        await sendTicketEmail({
            email: booking.email,
            name: booking.name,
            ticketId: booking.ticketId,
            ticketCount: booking.ticketCount,
            totalAmount: booking.totalAmount,
            pdfUrl: pdfUrl,
            pdfBuffer: ticketResult.pdfBuffer,
        });
    } catch (emailErr) {
        console.error('Failed to send ticket email via Resend:', emailErr.message);
    }

    return booking;
};

export const verifyPayment = asyncHandler(async (req, res) => {
    const { bookingId, razorpayPaymentId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found');
    }

    if (booking.bookingStatus === BOOKING_STATUS.TICKET_GENERATED || booking.bookingStatus === BOOKING_STATUS.CHECKED_IN) {
        return res.status(StatusCodes.OK).json({
            success: true,
            message: 'Booking already verified and ticket generated',
            booking,
        });
    }

    booking.bookingStatus = BOOKING_STATUS.PAYMENT_SUCCESS;
    booking.razorpayPaymentId = razorpayPaymentId || booking.razorpayPaymentId;
    booking.paymentVerifiedAt = new Date();

    await processBookingCompletion(booking);

    return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment verified and ticket email sent successfully',
        booking,
    });
});

export const razorpayWebhook = asyncHandler(async (req, res) => {
    const { event, payload } = req.body;

    if (event === 'payment.captured' || event === 'order.paid') {
        const razorpayOrderId = payload.payment.entity.order_id;
        const booking = await Booking.findOne({ razorpayOrderId });
        if (booking && booking.bookingStatus !== BOOKING_STATUS.TICKET_GENERATED) {
            booking.bookingStatus = BOOKING_STATUS.PAYMENT_SUCCESS;
            booking.razorpayPaymentId = payload.payment.entity.id;
            booking.paymentVerifiedAt = new Date();
            await processBookingCompletion(booking);
        }
    }

    return res.status(StatusCodes.OK).json({ received: true });
});

