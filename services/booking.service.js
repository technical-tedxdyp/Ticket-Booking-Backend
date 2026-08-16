import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import { BOOKING_STATUS, MAX_TICKETS_PER_USER } from '../utils/constants.js';
import { getSessionsByIds, calculateSessionsTotalPrice, getSessionById } from '../config/sessions.js';
import { redis } from '../providers/redis.js';

// --- Email-Scoped Lock Mechanism (Redis Distributed Lock + In-Memory Queue) ---
const localEmailLocks = new Map();

const acquireEmailLock = async (normalizedEmail, timeoutMs = 8000) => {
    // 1. In-memory per-email serialization
    while (localEmailLocks.has(normalizedEmail)) {
        await new Promise((r) => setTimeout(r, 25));
    }

    let localRelease;
    const lockPromise = new Promise((resolve) => {
        localRelease = resolve;
    });
    localEmailLocks.set(normalizedEmail, lockPromise);

    const safetyTimer = setTimeout(() => {
        if (localEmailLocks.get(normalizedEmail) === lockPromise) {
            localEmailLocks.delete(normalizedEmail);
            localRelease();
        }
    }, timeoutMs);

    // 2. Redis distributed lock if available
    let redisLockKey = null;
    let redisLockToken = null;

    if (redis) {
        redisLockKey = `booking_lock:${normalizedEmail}`;
        redisLockToken = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const maxRetries = 15;
        let acquired = false;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const res = await redis.set(redisLockKey, redisLockToken, { nx: true, ex: 10 });
                if (res === 'OK' || res === true) {
                    acquired = true;
                    break;
                }
            } catch (e) {
                // Redis error fallback to local lock
                break;
            }
            await new Promise((r) => setTimeout(r, 40));
        }
    }

    return async () => {
        clearTimeout(safetyTimer);
        if (redis && redisLockKey && redisLockToken) {
            try {
                const current = await redis.get(redisLockKey);
                if (current === redisLockToken) {
                    await redis.del(redisLockKey);
                }
            } catch (e) {
                // Ignore redis release errors, TTL will auto-expire
            }
        }
        if (localEmailLocks.get(normalizedEmail) === lockPromise) {
            localEmailLocks.delete(normalizedEmail);
        }
        localRelease();
    };
};

export const createPendingBooking = async ({ name, email, phone, selectedSessions, ticketCount }) => {
    // normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Acquire lock scoped to this specific email (different emails do not block each other)
    const releaseLock = await acquireEmailLock(normalizedEmail);

    try {
        // Normalize selected sessions
        const sessionIds = selectedSessions.map((s) => String(s).toLowerCase().trim());
        const uniqueSessionIds = [...new Set(sessionIds)];

        if (uniqueSessionIds.length !== selectedSessions.length) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Duplicate sessions are not allowed.');
        }

        let validSessions = getSessionsByIds(uniqueSessionIds);
        let perTicketPrice = 0;

        if (validSessions.length === uniqueSessionIds.length) {
            perTicketPrice = calculateSessionsTotalPrice(uniqueSessionIds);
        } else {
            // Fallback for MongoDB ObjectId session lookups
            const isObjectIds = uniqueSessionIds.every((id) => mongoose.Types.ObjectId.isValid(id));
            if (isObjectIds) {
                const dbSessions = await Session.find({
                    _id: { $in: uniqueSessionIds },
                    isActive: true,
                });
                if (dbSessions.length !== uniqueSessionIds.length) {
                    throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more selected sessions are invalid.');
                }
                perTicketPrice = dbSessions.reduce((sum, s) => sum + s.price, 0);
            } else {
                throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more selected sessions are invalid.');
            }
        }

        // Ticket Limit: Count active PENDING, PAYMENT_SUCCESS, TICKET_GENERATED, CHECKED_IN
        // Email is the ONLY identifier. Phone number must NOT be used.
        // PENDING counts only while active/unexpired (reservationExpiresAt > now).
        const now = new Date();
        const existingBookings = await Booking.find({
            email: normalizedEmail,
            $or: [
                {
                    bookingStatus: {
                        $in: [
                            BOOKING_STATUS.PAYMENT_SUCCESS,
                            BOOKING_STATUS.TICKET_GENERATED,
                            BOOKING_STATUS.CHECKED_IN,
                        ],
                    },
                },
                {
                    bookingStatus: BOOKING_STATUS.PENDING,
                    reservationExpiresAt: { $gt: now },
                },
            ],
        });

        const alreadyBooked = existingBookings.reduce((sum, booking) => sum + booking.ticketCount, 0);

        if (alreadyBooked + ticketCount > MAX_TICKETS_PER_USER) {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                `Maximum ticket limit exceeded. Already booked ${alreadyBooked}. Maximum allowed is ${MAX_TICKETS_PER_USER}.`
            );
        }

        // Atomic seat reservation for all selected sessions in Session model if present
        const successfullyReservedDbIds = [];

        try {
            for (const sId of uniqueSessionIds) {
                let sessionDoc;
                if (mongoose.Types.ObjectId.isValid(sId)) {
                    sessionDoc = await Session.findOne({ _id: sId, isActive: true });
                } else {
                    const staticSess = getSessionById(sId);
                    const searchTitle = staticSess ? staticSess.title : sId;
                    sessionDoc = await Session.findOne({
                        title: { $regex: new RegExp(`^${searchTitle}`, 'i') },
                        isActive: true,
                    }).sort({ createdAt: -1 });
                }

                if (sessionDoc) {
                    const updatedSession = await Session.findOneAndUpdate(
                        {
                            _id: sessionDoc._id,
                            isActive: true,
                            $expr: {
                                $gte: [
                                    { $subtract: ['$totalSeats', { $add: ['$soldSeats', '$reservedSeats'] }] },
                                    ticketCount,
                                ],
                            },
                        },
                        {
                            $inc: { reservedSeats: ticketCount },
                        },
                        {
                            returnDocument: 'after',
                        }
                    );

                    if (!updatedSession) {
                        throw new ApiError(
                            StatusCodes.BAD_REQUEST,
                            `Not enough seats available for ${sessionDoc.title}.`
                        );
                    }

                    successfullyReservedDbIds.push(sessionDoc._id);
                }
            }

            // Calculate Total Price
            const totalAmount = perTicketPrice * ticketCount;

            // Create Pending Booking
            const bookingData = {
                name,
                email: normalizedEmail,
                phone,
                selectedSessions: uniqueSessionIds,
                ticketCount,
                totalAmount,
                bookingStatus: BOOKING_STATUS.PENDING,
            };

            const booking = await Booking.create(bookingData);

            return {
                booking,
                totalAmount,
            };
        } catch (error) {
            // Compensating rollback for any reserved seats if subsequent session failed
            if (successfullyReservedDbIds.length > 0) {
                try {
                    await Session.updateMany(
                        { _id: { $in: successfullyReservedDbIds } },
                        { $inc: { reservedSeats: -ticketCount } }
                    );
                } catch (rollbackErr) {
                    console.error('Rollback error during reservation failure:', rollbackErr);
                }
            }

            throw error;
        }
    } finally {
        await releaseLock();
    }
};

export const handlePaymentFailure = async (bookingId, reason = 'Payment failed') => {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid booking ID format.');
    }

    // Atomically find and update ONLY if bookingStatus is PENDING (Idempotent)
    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            bookingStatus: BOOKING_STATUS.PENDING,
        },
        {
            $set: {
                bookingStatus: BOOKING_STATUS.PAYMENT_FAILED,
            },
        },
        { returnDocument: 'before' } // returns document prior to update
    );

    if (!booking) {
        const existing = await Booking.findById(bookingId);
        if (!existing) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found.');
        }
        // If already PAYMENT_FAILED, EXPIRED or another state, do not release seats again (idempotent)
        return { booking: existing, seatsReleased: false };
    }

    // Release reservedSeats for all selected sessions
    if (booking.selectedSessions && booking.selectedSessions.length > 0 && booking.ticketCount > 0) {
        const isObjectIds = booking.selectedSessions.every((id) => mongoose.Types.ObjectId.isValid(id));
        if (isObjectIds) {
            await Session.updateMany(
                { _id: { $in: booking.selectedSessions } },
                { $inc: { reservedSeats: -booking.ticketCount } }
            );
        } else {
            for (const sId of booking.selectedSessions) {
                const staticSess = getSessionById(sId);
                const searchTitle = staticSess ? staticSess.title : sId;
                await Session.updateOne(
                    { title: { $regex: new RegExp(`^${searchTitle}`, 'i') } },
                    { $inc: { reservedSeats: -booking.ticketCount } }
                );
            }
        }
    }

    const updatedBooking = await Booking.findById(bookingId);
    return { booking: updatedBooking, seatsReleased: true };
};

export const expireBooking = async (bookingId) => {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid booking ID format.');
    }

    // Atomically transition ONLY if currently PENDING (Idempotent)
    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            bookingStatus: BOOKING_STATUS.PENDING,
        },
        {
            $set: {
                bookingStatus: BOOKING_STATUS.EXPIRED,
            },
        },
        { returnDocument: 'before' } // returns document prior to update
    );

    if (!booking) {
        const existing = await Booking.findById(bookingId);
        if (!existing) {
            throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found.');
        }
        // If already EXPIRED, PAYMENT_FAILED, or another state, do not release seats again (idempotent)
        return { booking: existing, seatsReleased: false };
    }

    // Release reservedSeats for all selected sessions
    if (booking.selectedSessions && booking.selectedSessions.length > 0 && booking.ticketCount > 0) {
        const isObjectIds = booking.selectedSessions.every((id) => mongoose.Types.ObjectId.isValid(id));
        if (isObjectIds) {
            await Session.updateMany(
                { _id: { $in: booking.selectedSessions } },
                { $inc: { reservedSeats: -booking.ticketCount } }
            );
        } else {
            for (const sId of booking.selectedSessions) {
                const staticSess = getSessionById(sId);
                const searchTitle = staticSess ? staticSess.title : sId;
                await Session.updateOne(
                    { title: { $regex: new RegExp(`^${searchTitle}`, 'i') } },
                    { $inc: { reservedSeats: -booking.ticketCount } }
                );
            }
        }
    }

    const updatedBooking = await Booking.findById(bookingId);
    return { booking: updatedBooking, seatsReleased: true };
};

export const processExpiredBookings = async () => {
    const now = new Date();
    // Find active PENDING bookings whose reservation window has expired
    const expiredPendingBookings = await Booking.find({
        bookingStatus: BOOKING_STATUS.PENDING,
        reservationExpiresAt: { $lte: now },
    });

    const results = [];
    for (const booking of expiredPendingBookings) {
        try {
            const res = await expireBooking(booking._id);
            results.push(res);
        } catch (err) {
            console.error(`Error processing expired booking ${booking._id}:`, err.message);
        }
    }

    return results;
};

export const startExpiryWorker = (intervalMs = 30000) => {
    const interval = setInterval(async () => {
        try {
            await processExpiredBookings();
        } catch (err) {
            console.error('Expiry worker run error:', err.message);
        }
    }, intervalMs);

    return () => clearInterval(interval);
};

export const getBookingById = async (bookingId) => {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid booking ID format.');
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found.');
    }

    // Map selected sessions to rich session details
    let sessionDetails = [];
    if (Array.isArray(booking.selectedSessions)) {
        const isObjectIds = booking.selectedSessions.every((id) => mongoose.Types.ObjectId.isValid(id));
        if (isObjectIds) {
            sessionDetails = await Session.find({ _id: { $in: booking.selectedSessions } }).select(
                '_id title day startTime endTime price totalSeats reservedSeats soldSeats speakers isActive'
            );
        } else {
            sessionDetails = getSessionsByIds(booking.selectedSessions);
            if (sessionDetails.length === 0) {
                sessionDetails = await Session.find({
                    title: { $in: booking.selectedSessions.map((s) => new RegExp(s, 'i')) },
                }).select('_id title day startTime endTime price totalSeats reservedSeats soldSeats speakers isActive');
            }
        }
    }

    return {
        bookingId: booking._id,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        ticketCount: booking.ticketCount,
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        selectedSessions: sessionDetails.length > 0 ? sessionDetails : booking.selectedSessions,
        createdAt: booking.createdAt,
        expiresAt: booking.reservationExpiresAt,
        ticketId: booking.ticketId || null,
        qrCode: booking.qrCode || null,
        pdfUrl: booking.pdfUrl || null,
    };
};
