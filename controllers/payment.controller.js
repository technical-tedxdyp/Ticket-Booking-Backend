// controllers/payment.controller.js
import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import { StatusCodes } from 'http-status-codes';
import { BOOKING_STATUS } from '../utils/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateTicket } from '../services/ticket.service.js';
import { sendTicketEmail } from '../services/resend.service.js';
import { uploadTicketPDF } from '../services/cloudinary.service.js';
import { 
  verifyPaymentSignature, 
  verifyWebhookSignature 
} from '../providers/razorpay.js';
import logger from '../utils/logger.js';

/**
 * Process booking completion - Generate ticket, upload, send email
 */
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
            logger.error('Cloudinary upload error (non-fatal):', err.message);
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
        logger.info(`Ticket email sent for booking: ${booking._id}`);
    } catch (emailErr) {
        logger.error('Failed to send ticket email via Resend:', emailErr.message);
    }

    return booking;
};

/**
 * Convert reserved seats to sold seats (Seat Conversion)
 */
const convertSeats = async (booking, session = null) => {
    const { selectedSessions, ticketCount } = booking;
    const options = session ? { session } : {};

    for (const sessionId of selectedSessions) {
        const result = await Session.findByIdAndUpdate(
            sessionId,
            {
                $inc: {
                    reservedSeats: -ticketCount,
                    soldSeats: ticketCount
                }
            },
            { ...options, new: true }
        );

        if (!result) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        logger.debug(`Converted ${ticketCount} seats for session ${sessionId}: reserved→sold`);
    }
};

/**
 * Release reserved seats (Seat Release)
 */
const releaseSeats = async (booking, session = null) => {
    const { selectedSessions, ticketCount } = booking;
    const options = session ? { session } : {};

    for (const sessionId of selectedSessions) {
        const result = await Session.findByIdAndUpdate(
            sessionId,
            {
                $inc: {
                    reservedSeats: -ticketCount
                }
            },
            { ...options, new: true }
        );

        if (!result) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        logger.debug(`Released ${ticketCount} seats for session ${sessionId}`);
    }
};

/**
 * Verify Payment API
 * POST /api/payment/verify
 * 
 * Responsibilities:
 * - Verify payment signature ✅
 * - Update booking status ✅
 * - Convert seats (reserved → sold) ✅
 * - Generate ticket ✅
 * - Send email ✅
 */
export const verifyPayment = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { 
            bookingId, 
            razorpayOrderId,
            razorpayPaymentId, 
            razorpaySignature 
        } = req.body;

        logger.info(`Payment verification started for booking: ${bookingId}`);

        // 1. Fetch booking
        const booking = await Booking.findById(bookingId).session(session);
        if (!booking) {
            await session.abortTransaction();
            session.endSession();
            throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found');
        }

        // 2. Idempotency check - if already processed
        if (booking.bookingStatus === BOOKING_STATUS.TICKET_GENERATED || 
            booking.bookingStatus === BOOKING_STATUS.CHECKED_IN) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.OK).json({
                success: true,
                message: 'Booking already verified and ticket generated',
                data: {
                    bookingId: booking._id,
                    bookingStatus: booking.bookingStatus,
                    ticketId: booking.ticketId
                }
            });
        }

        // 3. Check if booking is still PENDING
        if (booking.bookingStatus !== BOOKING_STATUS.PENDING) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.OK).json({
                success: true,
                message: `Booking already ${booking.bookingStatus}`,
                data: {
                    bookingId: booking._id,
                    bookingStatus: booking.bookingStatus
                }
            });
        }

        // 4. Verify order ID matches
        if (booking.razorpayOrderId !== razorpayOrderId) {
            await session.abortTransaction();
            session.endSession();
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Order ID mismatch');
        }

        // 5. Verify payment signature (CRITICAL SECURITY STEP)
        const isValidSignature = verifyPaymentSignature({
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature
        });

        if (!isValidSignature) {
            // Mark as failed and release seats
            booking.bookingStatus = BOOKING_STATUS.PAYMENT_FAILED;
            booking.razorpayPaymentId = razorpayPaymentId;
            await booking.save({ session });

            // Release seats
            await releaseSeats(booking, session);

            await session.commitTransaction();
            session.endSession();

            logger.warn(`Invalid payment signature for booking: ${bookingId}`);
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid payment signature');
        }

        // 6. Atomic update: PENDING → PAYMENT_SUCCESS
        const updatedBooking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                bookingStatus: BOOKING_STATUS.PENDING
            },
            {
                bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                razorpayPaymentId: razorpayPaymentId || booking.razorpayPaymentId,
                paymentVerifiedAt: new Date()
            },
            { session, new: true }
        );

        if (!updatedBooking) {
            await session.abortTransaction();
            session.endSession();
            
            const currentBooking = await Booking.findById(bookingId);
            return res.status(StatusCodes.OK).json({
                success: true,
                message: `Booking already ${currentBooking.bookingStatus}`,
                data: {
                    bookingId: currentBooking._id,
                    bookingStatus: currentBooking.bookingStatus
                }
            });
        }

        // 7. Convert seats: reserved → sold (SEAT CONVERSION)
        await convertSeats(updatedBooking, session);

        // 8. Process booking completion (generate ticket, upload, send email)
        // Note: ticket.service.js will handle session data via getSessionsByIds
        await processBookingCompletion(updatedBooking);

        await session.commitTransaction();
        session.endSession();

        logger.info(`Payment verified successfully for booking: ${bookingId}`);

        const finalBooking = await Booking.findById(bookingId);

        return res.status(StatusCodes.OK).json({
            success: true,
            message: 'Payment verified and ticket generated successfully',
            data: {
                bookingId: finalBooking._id,
                bookingStatus: finalBooking.bookingStatus,
                ticketId: finalBooking.ticketId,
                qrCode: finalBooking.qrCode,
                pdfUrl: finalBooking.pdfUrl
            }
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        logger.error('Payment verification error:', error);
        
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(
            StatusCodes.INTERNAL_SERVER_ERROR, 
            'Failed to verify payment'
        );
    }
});

/**
 * Razorpay Webhook Handler
 * POST /api/payment/webhook
 * 
 * Responsibilities:
 * - Verify webhook signature ✅
 * - Handle payment.captured ✅
 * - Handle payment.failed ✅
 * - Update booking status ✅
 * - Convert/release seats ✅
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
    const webhookSignature = req.headers['x-razorpay-signature'];
    
    // 1. Verify webhook signature (SECURITY)
    if (!webhookSignature) {
        logger.warn('Missing webhook signature');
        return res.status(StatusCodes.BAD_REQUEST).json({ 
            success: false, 
            message: 'Missing webhook signature' 
        });
    }

    const isValidSignature = verifyWebhookSignature(
        JSON.stringify(req.body),
        webhookSignature
    );

    if (!isValidSignature) {
        logger.warn('Invalid webhook signature');
        return res.status(StatusCodes.BAD_REQUEST).json({ 
            success: false, 
            message: 'Invalid webhook signature' 
        });
    }

    const { event, payload } = req.body;
    logger.info(`Webhook received: ${event}`);

    try {
        switch (event) {
            case 'payment.captured':
            case 'order.paid':
                await handlePaymentCaptured(payload);
                break;

            case 'payment.failed':
                await handlePaymentFailed(payload);
                break;

            default:
                logger.info(`Unhandled webhook event: ${event}`);
        }

        // Always return 200 to acknowledge receipt
        return res.status(StatusCodes.OK).json({ 
            success: true, 
            message: 'Webhook processed' 
        });

    } catch (error) {
        logger.error('Webhook processing error:', error);
        // Still return 200 to prevent retries
        return res.status(StatusCodes.OK).json({ 
            success: false, 
            message: 'Webhook processed with errors' 
        });
    }
});

/**
 * Handle payment captured webhook
 */
const handlePaymentCaptured = async (payload) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const payment = payload.payment.entity;
        const { order_id: orderId, id: paymentId } = payment;

        logger.info(`Payment captured webhook: ${paymentId} for order ${orderId}`);

        // Find booking by order ID
        const booking = await Booking.findOne({ 
            razorpayOrderId: orderId 
        }).session(session);

        if (!booking) {
            logger.error(`No booking found for order: ${orderId}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        // If already processed, skip
        if (booking.bookingStatus === BOOKING_STATUS.TICKET_GENERATED || 
            booking.bookingStatus === BOOKING_STATUS.CHECKED_IN) {
            logger.info(`Booking already processed: ${booking._id}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        if (booking.bookingStatus !== BOOKING_STATUS.PENDING) {
            logger.info(`Booking already ${booking.bookingStatus}: ${booking._id}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        // Atomic update: PENDING → PAYMENT_SUCCESS
        const updatedBooking = await Booking.findOneAndUpdate(
            {
                _id: booking._id,
                bookingStatus: BOOKING_STATUS.PENDING
            },
            {
                bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                razorpayPaymentId: paymentId,
                paymentVerifiedAt: new Date()
            },
            { session, new: true }
        );

        if (!updatedBooking) {
            await session.abortTransaction();
            session.endSession();
            return;
        }

        // Convert seats: reserved → sold
        await convertSeats(updatedBooking, session);

        // Process booking completion (generate ticket, upload, send email)
        // Note: ticket.service.js will handle session data via getSessionsByIds
        await processBookingCompletion(updatedBooking);

        await session.commitTransaction();
        session.endSession();

        logger.info(`Webhook: Booking confirmed ${booking._id}`);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Error handling payment captured webhook:', error);
        throw error;
    }
};

/**
 * Handle payment failed webhook
 */
const handlePaymentFailed = async (payload) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const payment = payload.payment.entity;
        const { order_id: orderId, id: paymentId } = payment;

        logger.warn(`Payment failed webhook: ${paymentId} for order ${orderId}`);

        // Find booking by order ID
        const booking = await Booking.findOne({ 
            razorpayOrderId: orderId 
        }).session(session);

        if (!booking) {
            logger.error(`No booking found for failed order: ${orderId}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        // If already processed, skip
        if (booking.bookingStatus !== BOOKING_STATUS.PENDING) {
            logger.info(`Booking already ${booking.bookingStatus}: ${booking._id}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        // Update booking status to failed
        booking.bookingStatus = BOOKING_STATUS.PAYMENT_FAILED;
        booking.razorpayPaymentId = paymentId;
        booking.paymentVerifiedAt = new Date();
        await booking.save({ session });

        // Release seats (SEAT RELEASE)
        await releaseSeats(booking, session);

        await session.commitTransaction();
        session.endSession();

        logger.info(`Webhook: Booking marked as failed ${booking._id}`);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Error handling payment failed webhook:', error);
        throw error;
    }
};