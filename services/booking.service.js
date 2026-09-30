import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import { BOOKING_STATUS, MAX_TICKETS_PER_USER } from '../utils/constants.js';
import { redis } from '../providers/redis.js';
import { collectSeatSessionIds, getBookingSeatSessionIds, hasSelectedIncludedSession } from './session-capacity.service.js';

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
        const cleanedSelectedSessions = Array.isArray(selectedSessions)
            ? selectedSessions.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)
            : [];

        if (cleanedSelectedSessions.length === 0) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Select at least one session.');
        }

        // Normalize selected sessions
        const sessionIds = cleanedSelectedSessions.map((s) => String(s).toLowerCase().trim());
        const uniqueSessionIds = [...new Set(sessionIds)];

        if (uniqueSessionIds.length !== cleanedSelectedSessions.length) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Duplicate sessions are not allowed.');
        }

        if (!uniqueSessionIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more selected sessions are invalid.');
        }

        const selectedSessionDocs = await Session.find({
            _id: { $in: uniqueSessionIds },
            isActive: true,
        }).populate('includedSessions');
        if (selectedSessionDocs.length !== uniqueSessionIds.length) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more selected sessions are invalid.');
        }
        if (hasSelectedIncludedSession(selectedSessionDocs)) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'A session cannot be booked together with a session it includes.');
        }
        const perTicketPrice = selectedSessionDocs.reduce((sum, session) => sum + session.price, 0);

        const seatSessionIds = collectSeatSessionIds(selectedSessionDocs);
        const seatSessions = await Session.find({ _id: { $in: seatSessionIds }, isActive: true }).sort({ _id: 1 });
        if (seatSessions.length !== seatSessionIds.length) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more included sessions are unavailable.');
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
                        $in: [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN],
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
                `Maximum ticket limit exceeded. Already booked ${alreadyBooked}. Maximum allowed is ${MAX_TICKETS_PER_USER}.`,
            );
        }

        // Atomic seat reservation for all selected sessions in Session model if present
        const successfullyReservedDbIds = [];

        try {
            for (const sessionDoc of seatSessions) {
                const updatedSession = await Session.findOneAndUpdate(
                    {
                        _id: sessionDoc._id,
                        isActive: true,
                        $expr: {
                            $gte: [{ $subtract: ['$totalSeats', { $add: ['$soldSeats', '$reservedSeats'] }] }, ticketCount],
                        },
                    },
                    {
                        $inc: { reservedSeats: ticketCount },
                    },
                    {
                        returnDocument: 'after',
                    },
                );

                if (!updatedSession) {
                    throw new ApiError(StatusCodes.BAD_REQUEST, `Not enough seats available for ${sessionDoc.title}.`);
                }

                successfullyReservedDbIds.push(sessionDoc._id);
            }

            // Calculate Total Price
            const totalAmount = perTicketPrice * ticketCount;

            // Create Pending Booking
            const bookingData = {
                name,
                email: normalizedEmail,
                phone,
                selectedSessions: uniqueSessionIds,
                seatSessionIds,
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
                    await Session.updateMany({ _id: { $in: successfullyReservedDbIds } }, { $inc: { reservedSeats: -ticketCount } });
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

    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const booking = await Booking.findOneAndUpdate(
            { _id: bookingId, bookingStatus: BOOKING_STATUS.PENDING },
            { $set: { bookingStatus: BOOKING_STATUS.PAYMENT_FAILED } },
            { session, returnDocument: 'before' },
        );

        if (!booking) {
            await session.abortTransaction();
            const existing = await Booking.findById(bookingId);
            if (!existing) {
                throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found.');
            }
            return { booking: existing, seatsReleased: false };
        }

        const sessionIds = getBookingSeatSessionIds(booking).filter((id) => mongoose.Types.ObjectId.isValid(id));
        if (sessionIds.length > 0 && booking.ticketCount > 0) {
            await Session.updateMany({ _id: { $in: sessionIds } }, { $inc: { reservedSeats: -booking.ticketCount } }, { session });
        }

        await session.commitTransaction();
        return { booking: await Booking.findById(bookingId), seatsReleased: true };
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};

export const expireBooking = async (bookingId) => {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid booking ID format.');
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const booking = await Booking.findOneAndUpdate(
            { _id: bookingId, bookingStatus: BOOKING_STATUS.PENDING },
            { $set: { bookingStatus: BOOKING_STATUS.EXPIRED } },
            { session, returnDocument: 'before' },
        );

        if (!booking) {
            await session.abortTransaction();
            const existing = await Booking.findById(bookingId);
            if (!existing) {
                throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found.');
            }
            return { booking: existing, seatsReleased: false };
        }

        const sessionIds = getBookingSeatSessionIds(booking).filter((id) => mongoose.Types.ObjectId.isValid(id));
        if (sessionIds.length > 0 && booking.ticketCount > 0) {
            await Session.updateMany({ _id: { $in: sessionIds } }, { $inc: { reservedSeats: -booking.ticketCount } }, { session });
        }

        await session.commitTransaction();
        return { booking: await Booking.findById(bookingId), seatsReleased: true };
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
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
    let isRunning = false;
    const run = async () => {
        if (isRunning) return;
        isRunning = true;
        try {
            await processExpiredBookings();
        } catch (err) {
            console.error('Expiry worker run error:', err.message);
        } finally {
            isRunning = false;
        }
    };

    void run();
    const interval = setInterval(run, intervalMs);

    return () => clearInterval(interval);
};

export const removeBookingExpiryTtlIndex = async () => {
    let indexes;
    try {
        indexes = await Booking.collection.indexes();
    } catch (error) {
        if (error.code === 26 || error.codeName === 'NamespaceNotFound') return;
        throw error;
    }
    const ttlIndexes = indexes.filter(
        (index) => index.expireAfterSeconds !== undefined && index.key?.reservationExpiresAt === 1 && Object.keys(index.key).length === 1,
    );

    for (const index of ttlIndexes) {
        await Booking.collection.dropIndex(index.name);
        console.log(`Removed booking TTL index: ${index.name}`);
    }
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
        const sessionIds = booking.selectedSessions.filter((id) => mongoose.Types.ObjectId.isValid(id));
        const foundSessions = await Session.find({ _id: { $in: sessionIds } }).select(
            '_id title day startTime endTime price totalSeats reservedSeats soldSeats speakers isActive',
        );
        const sessionsById = new Map(foundSessions.map((session) => [session._id.toString(), session]));
        sessionDetails = sessionIds.map((id) => sessionsById.get(id)).filter(Boolean);
    }

    return {
        bookingId: booking._id,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        ticketCount: booking.ticketCount,
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        selectedSessions: sessionDetails,
        createdAt: booking.createdAt,
        expiresAt: booking.reservationExpiresAt,
        ticketId: booking.ticketId || null,
        qrCode: booking.qrCode || null,
        pdfUrl: booking.pdfUrl || null,
    };
};
