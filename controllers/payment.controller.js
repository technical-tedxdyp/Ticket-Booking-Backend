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
import { verifyPaymentSignature, verifyWebhookSignature } from '../providers/razorpay.js';
import logger from '../utils/logger.js';
import { getBookingSeatSessionIds } from '../services/session-capacity.service.js';

export const isWriteConflictError = (error) => {
    if (!error) return false;

    return (
        error.code === 112 ||
        error.codeName === 'WriteConflict' ||
        error.name === 'WriteConflict' ||
        (typeof error.message === 'string' && /Write conflict|write conflict/i.test(error.message))
    );
};

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
    booking.ticketProcessingAt = null;
    booking.ticketRetryAfter = null;
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

const completeBookingTicket = async (bookingId) => {
    const now = new Date();
    const staleClaimBefore = new Date(now.getTime() - 5 * 60 * 1000);
    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
            $or: [{ ticketProcessingAt: { $exists: false } }, { ticketProcessingAt: null }, { ticketProcessingAt: { $lt: staleClaimBefore } }],
        },
        { $set: { ticketProcessingAt: now } },
        { returnDocument: 'after' },
    );

    if (!booking) {
        return Booking.findById(bookingId);
    }

    try {
        return await processBookingCompletion(booking);
    } catch (error) {
        await Booking.updateOne(
            {
                _id: bookingId,
                bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                ticketProcessingAt: now,
            },
            {
                $set: {
                    ticketProcessingAt: null,
                    ticketRetryAfter: new Date(Date.now() + 5 * 60 * 1000),
                },
            },
        );
        throw error;
    }
};

export const startTicketRetryWorker = (intervalMs = 30000) => {
    const interval = setInterval(async () => {
        try {
            const pendingBookings = await Booking.find({
                bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                $or: [{ ticketRetryAfter: { $exists: false } }, { ticketRetryAfter: null }, { ticketRetryAfter: { $lte: new Date() } }],
            })
                .select('_id')
                .lean();

            for (const booking of pendingBookings) {
                try {
                    await completeBookingTicket(booking._id);
                } catch (error) {
                    logger.error(`Ticket retry failed for booking: ${booking._id}`, error);
                }
            }
        } catch (error) {
            logger.error('Ticket retry worker failed:', error);
        }
    }, intervalMs);

    return () => clearInterval(interval);
};

/**
 * Convert reserved seats to sold seats (Seat Conversion)
 */
const convertSeats = async (booking, session = null) => {
    const { ticketCount } = booking;
    const sessionIds = getBookingSeatSessionIds(booking);
    const options = session ? { session } : {};

    for (const sessionId of sessionIds) {
        const result = await Session.findByIdAndUpdate(
            sessionId,
            {
                $inc: {
                    reservedSeats: -ticketCount,
                    soldSeats: ticketCount,
                },
            },
            { ...options, returnDocument: 'after' },
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
    const { ticketCount } = booking;
    const sessionIds = getBookingSeatSessionIds(booking);
    const options = session ? { session } : {};

    for (const sessionId of sessionIds) {
        const result = await Session.findByIdAndUpdate(
            sessionId,
            {
                $inc: {
                    reservedSeats: -ticketCount,
                },
            },
            { ...options, returnDocument: 'after' },
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
    let invalidSignature = false;
    let paymentCommitted = false;

    try {
        const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        logger.info(`Payment verification started for booking: ${bookingId}`);

        // 1. Fetch booking
        const booking = await Booking.findById(bookingId).session(session);
        if (!booking) {
            await session.abortTransaction();
            session.endSession();
            throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found');
        }

        // 2. Idempotency check - if already processed
        if (booking.bookingStatus === BOOKING_STATUS.TICKET_GENERATED || booking.bookingStatus === BOOKING_STATUS.CHECKED_IN) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.OK).json({
                success: true,
                message: 'Booking already verified and ticket generated',
                data: {
                    bookingId: booking._id,
                    bookingStatus: booking.bookingStatus,
                    ticketId: booking.ticketId,
                },
            });
        }

        const paymentAlreadyConfirmed = booking.bookingStatus === BOOKING_STATUS.PAYMENT_SUCCESS;
        if (paymentAlreadyConfirmed) {
            await session.abortTransaction();
            session.endSession();
            paymentCommitted = true;
        } else {
            // 3. Check if booking is still PENDING
            if (booking.bookingStatus !== BOOKING_STATUS.PENDING) {
                await session.abortTransaction();
                session.endSession();
                return res.status(StatusCodes.OK).json({
                    success: true,
                    message: `Booking already ${booking.bookingStatus}`,
                    data: {
                        bookingId: booking._id,
                        bookingStatus: booking.bookingStatus,
                    },
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
                razorpaySignature,
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
                invalidSignature = true;
            } else {
                // 6. Atomic update: PENDING → PAYMENT_SUCCESS
                const updatedBooking = await Booking.findOneAndUpdate(
                    {
                        _id: bookingId,
                        bookingStatus: BOOKING_STATUS.PENDING,
                    },
                    {
                        bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                        razorpayPaymentId: razorpayPaymentId || booking.razorpayPaymentId,
                        paymentVerifiedAt: new Date(),
                    },
                    { session, returnDocument: 'after' },
                );

                if (!updatedBooking) {
                    await session.abortTransaction();
                    session.endSession();

                    const currentBooking = await Booking.findById(bookingId);
                    if (currentBooking?.bookingStatus !== BOOKING_STATUS.PAYMENT_SUCCESS) {
                        return res.status(StatusCodes.OK).json({
                            success: true,
                            message: `Booking already ${currentBooking?.bookingStatus}`,
                            data: {
                                bookingId,
                                bookingStatus: currentBooking?.bookingStatus,
                            },
                        });
                    }
                    paymentCommitted = true;
                } else {
                    // 7. Convert seats: reserved → sold (SEAT CONVERSION)
                    await convertSeats(updatedBooking, session);
                    await session.commitTransaction();
                    session.endSession();
                    paymentCommitted = true;
                }
            }
        }

        if (invalidSignature) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid payment signature');
        }

        const finalBooking = await completeBookingTicket(bookingId);
        logger.info(`Payment verified successfully for booking: ${bookingId}`);

        return res.status(StatusCodes.OK).json({
            success: true,
            message:
                finalBooking?.bookingStatus === BOOKING_STATUS.TICKET_GENERATED
                    ? 'Payment verified and ticket generated successfully'
                    : 'Payment verified; ticket processing is in progress',
            data: {
                bookingId: finalBooking?._id || bookingId,
                bookingStatus: finalBooking?.bookingStatus || BOOKING_STATUS.PAYMENT_SUCCESS,
                ticketId: finalBooking?.ticketId,
                qrCode: finalBooking?.qrCode,
                pdfUrl: finalBooking?.pdfUrl,
            },
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();

        if (paymentCommitted) {
            logger.error(`Payment confirmed but ticket completion failed for booking: ${req.body?.bookingId}`, error);
            return res.status(StatusCodes.ACCEPTED).json({
                success: true,
                message: 'Payment was verified. Ticket generation is pending and will be retried.',
                data: {
                    bookingId: req.body?.bookingId,
                    bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                    ticketPending: true,
                },
            });
        }

        if (isWriteConflictError(error)) {
            logger.warn(
                `Payment verification write conflict for booking: ${req.body?.bookingId || 'unknown'}; another request is already processing it.`,
            );
            return res.status(StatusCodes.OK).json({
                success: true,
                message: 'Payment already being processed',
                data: {
                    bookingId: req.body?.bookingId,
                    bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                },
            });
        }

        logger.error('Payment verification error:', error);

        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to verify payment');
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
const parseWebhookBody = (body) => {
    if (!body) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Webhook body is required');
    }

    if (Buffer.isBuffer(body)) {
        return JSON.parse(body.toString('utf8'));
    }

    if (typeof body === 'string') {
        return JSON.parse(body);
    }

    return body;
};

export const razorpayWebhook = asyncHandler(async (req, res) => {
    const webhookSignature = req.headers['x-razorpay-signature'];

    if (!webhookSignature) {
        logger.warn('Missing webhook signature');
        return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Missing webhook signature',
        });
    }

    let parsedBody;
    try {
        parsedBody = parseWebhookBody(req.body);
    } catch (error) {
        logger.warn('Malformed webhook payload', error.message);
        return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Malformed webhook payload',
        });
    }

    const isValidSignature = verifyWebhookSignature(req.body, webhookSignature);

    if (!isValidSignature) {
        logger.warn('Invalid webhook signature');
        return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Invalid webhook signature',
        });
    }

    const { event, payload } = parsedBody;
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

        return res.status(StatusCodes.OK).json({
            success: true,
            message: 'Webhook processed',
        });
    } catch (error) {
        logger.error('Webhook processing error:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Webhook processing failed; Razorpay may retry',
        });
    }
});

/**
 * Handle payment captured webhook
 */
const handlePaymentCaptured = async (payload) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    let bookingId;

    try {
        const payment = payload.payment.entity;
        const { order_id: orderId, id: paymentId } = payment;

        logger.info(`Payment captured webhook: ${paymentId} for order ${orderId}`);

        // Find booking by order ID
        const booking = await Booking.findOne({
            razorpayOrderId: orderId,
        }).session(session);

        if (!booking) {
            logger.error(`No booking found for order: ${orderId}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }
        bookingId = booking._id;

        if (booking.bookingStatus === BOOKING_STATUS.TICKET_GENERATED || booking.bookingStatus === BOOKING_STATUS.CHECKED_IN) {
            logger.info(`Booking already processed: ${booking._id}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        const paymentAlreadyConfirmed = booking.bookingStatus === BOOKING_STATUS.PAYMENT_SUCCESS;
        if (paymentAlreadyConfirmed) {
            await session.abortTransaction();
            session.endSession();
        } else if (booking.bookingStatus !== BOOKING_STATUS.PENDING) {
            logger.info(`Booking already ${booking.bookingStatus}: ${booking._id}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        if (!paymentAlreadyConfirmed) {
            // Atomic update: PENDING → PAYMENT_SUCCESS
            const updatedBooking = await Booking.findOneAndUpdate(
                {
                    _id: booking._id,
                    bookingStatus: BOOKING_STATUS.PENDING,
                },
                {
                    bookingStatus: BOOKING_STATUS.PAYMENT_SUCCESS,
                    razorpayPaymentId: paymentId,
                    paymentVerifiedAt: new Date(),
                },
                { session, returnDocument: 'after' },
            );

            if (updatedBooking) {
                await convertSeats(updatedBooking, session);
                await session.commitTransaction();
                session.endSession();
            } else {
                await session.abortTransaction();
                session.endSession();
                const currentBooking = await Booking.findById(booking._id);
                if (currentBooking?.bookingStatus !== BOOKING_STATUS.PAYMENT_SUCCESS) {
                    return;
                }
            }
        }
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();

        if (isWriteConflictError(error)) {
            logger.warn(
                `Webhook payment captured write conflict for order: ${payload?.payment?.entity?.order_id || 'unknown'}; another request is already processing it.`,
            );
            return;
        }

        logger.error('Error handling payment captured webhook:', error);
        throw error;
    }

    try {
        const completedBooking = await completeBookingTicket(bookingId);
        if (completedBooking?.bookingStatus === BOOKING_STATUS.TICKET_GENERATED) {
            logger.info(`Webhook: Booking confirmed ${bookingId}`);
        }
    } catch (error) {
        logger.error(`Webhook payment captured but ticket completion failed for booking: ${bookingId}`, error);
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
            razorpayOrderId: orderId,
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

        if (isWriteConflictError(error)) {
            logger.warn(
                `Webhook payment failed write conflict for order: ${payload?.payment?.entity?.order_id || 'unknown'}; another request is already processing it.`,
            );
            return;
        }

        logger.error('Error handling payment failed webhook:', error);
        throw error;
    }
};
