import mongoose from 'mongoose';
import { timingSafeEqual } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Booking from '../models/booking.model.js';
import EntryLog from '../models/entryLog.model.js';
import ScanAttempt from '../models/scanAttempt.model.js';
import Session from '../models/session.model.js';
// Register the historical actor model so old audit records can still populate.
import '../models/scannerOperator.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BOOKING_STATUS, ENTRY_ACTION, SCAN_OUTCOME } from '../utils/constants.js';
import { resolveEntitledSessions, selectAdmissionSession } from '../services/ticket-admission.service.js';

const getBookingAdmissionSessions = async (booking, dbSession) => {
    const selectedSessionIds = (booking.selectedSessions || []).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    const query = Session.find({ _id: { $in: selectedSessionIds } }).populate('includedSessions', 'title day startTime endTime');
    if (dbSession) query.session(dbSession);
    return resolveEntitledSessions(await query);
};

const getScanActor = (req, fallbackName) =>
    req.scannerOperator
        ? {
              scannedBy: req.scannerOperator.username,
              operator: req.scannerOperator.id || null,
              deviceId: req.scannerOperator.deviceId,
          }
        : { scannedBy: fallbackName, operator: null, deviceId: null };

const recordScanAttempt = ({ identifier, booking, sessionId, outcome, reason, scannedBy, operator, deviceId }) =>
    ScanAttempt.create({
        ticketId: String(identifier || 'UNKNOWN').slice(0, 128),
        booking: booking?._id || null,
        session: sessionId || null,
        outcome,
        reason: reason || '',
        scannedBy,
        operator,
        deviceId,
    });

// Admin Login
export const login = asyncHandler(async (req, res) => {
    const { adminKey, secretKey, password } = req.body;
    const providedKey = adminKey || secretKey || password;
    const validSecret = process.env.ADMIN_SECRET_KEY;

    if (!validSecret || Buffer.byteLength(validSecret) < 32) {
        throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'Admin authentication is not configured with a secret of at least 32 bytes.');
    }

    const providedBuffer = Buffer.from(providedKey || '');
    const expectedBuffer = Buffer.from(validSecret);
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid admin key or password');
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Admin authenticated successfully', {
            token: validSecret,
            role: 'SUPER_ADMIN',
            authenticated: true,
        }),
    );
});

// Get Dashboard Statistics
export const getDashboard = asyncHandler(async (req, res) => {
    const totalBookings = await Booking.countDocuments();

    const paidBookingsCount = await Booking.countDocuments({
        bookingStatus: {
            $in: [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN],
        },
    });

    const pendingBookingsCount = await Booking.countDocuments({
        bookingStatus: BOOKING_STATUS.PENDING,
    });

    const failedBookingsCount = await Booking.countDocuments({
        bookingStatus: BOOKING_STATUS.PAYMENT_FAILED,
    });

    const expiredBookingsCount = await Booking.countDocuments({
        bookingStatus: BOOKING_STATUS.EXPIRED,
    });

    const checkedInBookingsCount = await Booking.countDocuments({
        $or: [{ bookingStatus: BOOKING_STATUS.CHECKED_IN }, { checkedInAt: { $ne: null } }],
    });

    const totalCheckInLogs = await EntryLog.countDocuments();
    const totalAdmissions = await EntryLog.countDocuments({ action: ENTRY_ACTION.ENTRY });
    const [verifiedScanAttemptsCount, deniedScanAttemptsCount, duplicateScanAttemptsCount] = await Promise.all([
        ScanAttempt.countDocuments({ outcome: SCAN_OUTCOME.VERIFIED }),
        ScanAttempt.countDocuments({ outcome: SCAN_OUTCOME.DENIED }),
        ScanAttempt.countDocuments({ outcome: SCAN_OUTCOME.DUPLICATE }),
    ]);
    const totalScanAttempts = verifiedScanAttemptsCount + deniedScanAttemptsCount + duplicateScanAttemptsCount;

    // Calculate total tickets sold & revenue
    const paidBookings = await Booking.find({
        bookingStatus: {
            $in: [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN],
        },
    });

    const totalTicketsSold = paidBookings.reduce((sum, b) => sum + (b.ticketCount || 0), 0);
    const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    // Session-wise stats
    const sessions = await Session.find().lean();
    const admissionsBySession = await EntryLog.aggregate([
        { $match: { action: ENTRY_ACTION.ENTRY } },
        { $group: { _id: '$session', admissions: { $sum: 1 } } },
    ]);
    const admissionsBySessionId = new Map(admissionsBySession.map(({ _id, admissions }) => [String(_id), admissions]));
    const sessionStats = sessions.map((session) => ({
        id: session._id,
        title: session.title,
        day: session.day,
        totalSeats: session.totalSeats,
        reservedSeats: session.reservedSeats,
        soldSeats: session.soldSeats,
        availableSeats: session.totalSeats - session.reservedSeats - session.soldSeats,
        admissions: admissionsBySessionId.get(String(session._id)) || 0,
    }));

    // Recent 5 bookings
    const recentBookings = await Booking.find().sort({ createdAt: -1 }).limit(5).populate('selectedSessions', 'title day startTime endTime');

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Dashboard statistics fetched successfully', {
            overview: {
                totalBookings,
                paidBookingsCount,
                pendingBookingsCount,
                failedBookingsCount,
                expiredBookingsCount,
                totalTicketsSold,
                totalRevenue,
                checkedInBookingsCount,
                totalCheckInLogs,
                totalAdmissions,
                totalScanAttempts,
                verifiedScanAttemptsCount,
                deniedScanAttemptsCount,
                duplicateScanAttemptsCount,
            },
            sessions: sessionStats,
            recentBookings,
        }),
    );
});

// Get Paginated List of Bookings
export const getBookings = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { search, status, sessionId } = req.query;

    const query = {};

    if (status) {
        query.bookingStatus = status;
    }

    if (sessionId) {
        query.selectedSessions = sessionId;
    }

    if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        const searchConditions = [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { ticketId: searchRegex },
            { razorpayOrderId: searchRegex },
        ];

        if (mongoose.Types.ObjectId.isValid(search.trim())) {
            searchConditions.push({ _id: search.trim() });
        }

        query.$or = searchConditions;
    }

    const skip = (page - 1) * limit;

    const [bookings, totalBookings] = await Promise.all([
        Booking.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('selectedSessions', 'title day startTime endTime price'),
        Booking.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalBookings / limit) || 1;

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Bookings fetched successfully', {
            bookings,
            pagination: {
                total: totalBookings,
                page,
                limit,
                totalPages,
            },
        }),
    );
});

// Get Single Booking Details with Entry Logs
export const getBookingById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ _id: id }, { ticketId: id }] } : { ticketId: id };

    const booking = await Booking.findOne(query).populate('selectedSessions');

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found');
    }

    const entryLogs = await EntryLog.find({ booking: booking._id }).sort({ scannedAt: -1 }).populate('session', 'title day');

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Booking details fetched successfully', {
            booking,
            entryLogs,
        }),
    );
});

// Verify Ticket by ticketId / bookingId / qrPayload
export const verifyTicket = asyncHandler(async (req, res) => {
    const { ticketId, bookingId, qrPayload, scannedBy = 'Admin Scanner' } = req.body;
    const actor = getScanActor(req, scannedBy);
    const sessionId = req.body.sessionId?.toLowerCase();
    const identifier = ticketId || bookingId || qrPayload;

    const query = mongoose.Types.ObjectId.isValid(identifier)
        ? { $or: [{ _id: identifier }, { ticketId: identifier }, { qrCode: identifier }] }
        : { $or: [{ ticketId: identifier }, { qrCode: identifier }] };

    const booking = await Booking.findOne(query);

    if (!booking) {
        await recordScanAttempt({ identifier, sessionId, outcome: SCAN_OUTCOME.DENIED, reason: 'Ticket or Booking not found', ...actor });
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket or Booking not found');
    }

    const validStatuses = [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN];
    const isPaid = validStatuses.includes(booking.bookingStatus);

    if (!isPaid) {
        const reason = `Booking is currently ${booking.bookingStatus}. Payment not confirmed.`;
        await recordScanAttempt({ identifier, booking, sessionId, outcome: SCAN_OUTCOME.DENIED, reason, ...actor });
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, 'Ticket verification result', {
                valid: false,
                outcome: SCAN_OUTCOME.DENIED,
                reason,
                booking: {
                    id: booking._id,
                    name: booking.name,
                    email: booking.email,
                    ticketId: booking.ticketId,
                    bookingStatus: booking.bookingStatus,
                },
            }),
        );
    }

    const entitledSessions = await getBookingAdmissionSessions(booking);
    if (entitledSessions.length === 0) {
        const reason = 'This booking has no valid session entitlement.';
        await recordScanAttempt({ identifier, booking, sessionId, outcome: SCAN_OUTCOME.DENIED, reason, ...actor });
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, 'Ticket has no valid session entitlement', {
                valid: false,
                outcome: SCAN_OUTCOME.DENIED,
                reason,
                booking: { id: booking._id, name: booking.name, ticketId: booking.ticketId, bookingStatus: booking.bookingStatus },
                entitledSessions,
            }),
        );
    }
    const selectedSession = sessionId
        ? entitledSessions.find((session) => session.id === sessionId)
        : entitledSessions.length === 1
          ? entitledSessions[0]
          : null;
    if (sessionId && !selectedSession) {
        const reason = 'This ticket does not include the selected session.';
        await recordScanAttempt({ identifier, booking, sessionId, outcome: SCAN_OUTCOME.DENIED, reason, ...actor });
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, 'Ticket is not entitled to this session', {
                valid: false,
                outcome: SCAN_OUTCOME.DENIED,
                reason,
                booking: { id: booking._id, name: booking.name, ticketId: booking.ticketId, bookingStatus: booking.bookingStatus },
                entitledSessions,
            }),
        );
    }

    const entryLogs = await EntryLog.find({
        booking: booking._id,
        session: { $in: entitledSessions.map(({ id }) => id) },
        action: ENTRY_ACTION.ENTRY,
    }).lean();
    const logsBySession = new Map(entryLogs.map((log) => [String(log.session), log]));
    const sessionsWithStatus = entitledSessions.map((session) => {
        const entryLog = logsBySession.get(session.id);
        return {
            ...session,
            alreadyCheckedIn: Boolean(entryLog),
            checkedInAt: entryLog?.scannedAt || null,
            checkedInBy: entryLog?.scannedBy || null,
        };
    });
    const checkedSession = sessionId
        ? sessionsWithStatus.find((session) => session.id === sessionId)
        : sessionsWithStatus.length === 1
          ? sessionsWithStatus[0]
          : null;
    const alreadyCheckedIn = checkedSession
        ? checkedSession.alreadyCheckedIn
        : sessionsWithStatus.length > 0 && sessionsWithStatus.every((session) => session.alreadyCheckedIn);
    const outcome = alreadyCheckedIn ? SCAN_OUTCOME.DUPLICATE : SCAN_OUTCOME.VERIFIED;
    await recordScanAttempt({
        identifier,
        booking,
        sessionId: sessionId || checkedSession?.id,
        outcome,
        reason: alreadyCheckedIn ? 'Booking has already been checked in for the selected session.' : '',
        ...actor,
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Ticket verified successfully', {
            valid: true,
            outcome,
            alreadyCheckedIn,
            checkedInAt: checkedSession?.checkedInAt || booking.checkedInAt || null,
            checkedInBy: checkedSession?.checkedInBy || booking.checkedInBy || null,
            selectedSession: checkedSession || null,
            entitledSessions: sessionsWithStatus,
            booking: {
                id: booking._id,
                ticketId: booking.ticketId,
                name: booking.name,
                email: booking.email,
                phone: booking.phone,
                ticketCount: booking.ticketCount,
                bookingStatus: booking.bookingStatus,
                selectedSessions: booking.selectedSessions,
            },
        }),
    );
});

// Check-in Ticket
export const checkInTicket = asyncHandler(async (req, res) => {
    const { ticketId, bookingId, qrPayload, scannedBy = 'Admin Scanner', remarks } = req.body;
    const actor = getScanActor(req, scannedBy);
    const sessionId = req.body.sessionId?.toLowerCase();
    const identifier = ticketId || bookingId || qrPayload;

    const query = mongoose.Types.ObjectId.isValid(identifier)
        ? { $or: [{ _id: identifier }, { ticketId: identifier }, { qrCode: identifier }] }
        : { $or: [{ ticketId: identifier }, { qrCode: identifier }] };

    const dbSession = await mongoose.startSession();
    let checkedInBooking;
    let entryLog;
    let admittedSession;
    const checkedInAt = new Date();

    try {
        await dbSession.withTransaction(async () => {
            const booking = await Booking.findOne(query).session(dbSession);
            if (!booking) {
                throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket or Booking not found');
            }

            const validStatuses = [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN];
            if (!validStatuses.includes(booking.bookingStatus)) {
                throw new ApiError(
                    StatusCodes.BAD_REQUEST,
                    `Cannot check-in booking with status ${booking.bookingStatus}. Payment must be successful.`,
                );
            }

            const entitledSessions = await getBookingAdmissionSessions(booking, dbSession);
            admittedSession = selectAdmissionSession(entitledSessions, sessionId);
            if (!admittedSession) {
                throw new ApiError(
                    StatusCodes.BAD_REQUEST,
                    sessionId
                        ? 'This ticket does not include the selected session.'
                        : entitledSessions.length === 0
                          ? 'This booking has no valid session entitlement.'
                          : 'A sessionId is required because this ticket includes multiple sessions.',
                );
            }

            const existingEntry = await EntryLog.findOne({
                booking: booking._id,
                session: admittedSession.id,
                action: ENTRY_ACTION.ENTRY,
            })
                .session(dbSession)
                .lean();
            if (existingEntry) {
                throw new ApiError(StatusCodes.CONFLICT, 'This booking has already been checked in for the selected session.');
            }

            [entryLog] = await EntryLog.create(
                [
                    {
                        booking: booking._id,
                        ticketId: booking.ticketId || String(booking._id),
                        session: admittedSession.id,
                        action: ENTRY_ACTION.ENTRY,
                        scannedBy: actor.scannedBy,
                        operator: actor.operator,
                        deviceId: actor.deviceId,
                        scannedAt: checkedInAt,
                        remarks: remarks || 'Initial event check-in',
                    },
                ],
                { session: dbSession },
            );

            checkedInBooking = await Booking.findOneAndUpdate(
                {
                    _id: booking._id,
                    bookingStatus: { $in: validStatuses },
                },
                {
                    $set: {
                        bookingStatus: BOOKING_STATUS.CHECKED_IN,
                        checkedInAt: booking.checkedInAt || checkedInAt,
                        checkedInBy: booking.checkedInBy || actor.scannedBy,
                    },
                },
                { returnDocument: 'after', session: dbSession },
            );
            if (!checkedInBooking) {
                throw new ApiError(StatusCodes.CONFLICT, 'Booking status changed during check-in. Please verify the ticket again.');
            }
        });
    } catch (error) {
        if (error?.code === 11000) {
            await recordScanAttempt({
                identifier,
                sessionId: admittedSession?.id || sessionId,
                outcome: SCAN_OUTCOME.DUPLICATE,
                reason: error.message || 'Concurrent check-in already recorded for this booking and session.',
                ...actor,
            });
            throw new ApiError(StatusCodes.CONFLICT, 'This booking has already been checked in for the selected session.');
        }
        if (
            error?.statusCode === StatusCodes.CONFLICT ||
            error?.statusCode === StatusCodes.BAD_REQUEST ||
            error?.statusCode === StatusCodes.NOT_FOUND
        ) {
            const isDuplicate = error.message.includes('already been checked in');
            await recordScanAttempt({
                identifier,
                sessionId: admittedSession?.id || sessionId,
                outcome: isDuplicate ? SCAN_OUTCOME.DUPLICATE : SCAN_OUTCOME.DENIED,
                reason: error.message,
                ...actor,
            });
        }
        throw error;
    } finally {
        await dbSession.endSession();
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Check-in completed successfully', {
            success: true,
            checkedInAt,
            session: admittedSession,
            booking: {
                id: checkedInBooking._id,
                ticketId: checkedInBooking.ticketId,
                name: checkedInBooking.name,
                email: checkedInBooking.email,
                phone: checkedInBooking.phone,
                ticketCount: checkedInBooking.ticketCount,
                bookingStatus: checkedInBooking.bookingStatus,
            },
            entryLog,
        }),
    );
});

// Get Entry Logs List
export const getEntryLogs = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const { ticketId, action } = req.query;

    const query = {};
    if (ticketId) query.ticketId = ticketId;
    if (action) query.action = action;

    const skip = (page - 1) * limit;

    const [logs, totalLogs] = await Promise.all([
        EntryLog.find(query)
            .sort({ scannedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('booking', 'name email phone ticketCount bookingStatus')
            .populate('session', 'title day')
            .populate('operator', 'username role'),
        EntryLog.countDocuments(query),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Entry logs fetched successfully', {
            logs,
            pagination: {
                total: totalLogs,
                page,
                limit,
                totalPages: Math.ceil(totalLogs / limit) || 1,
            },
        }),
    );
});

export const getScanAttempts = asyncHandler(async (req, res) => {
    const { page, limit, outcome, ticketId, sessionId, operatorId, deviceId, scannedBy, from, to } = req.scanQuery;
    const query = {};
    const scannedAt = {};

    if (outcome) query.outcome = outcome;
    if (ticketId) query.ticketId = ticketId;
    if (sessionId) query.session = sessionId;
    if (operatorId) query.operator = operatorId;
    if (deviceId) query.deviceId = deviceId;
    if (scannedBy) query.scannedBy = scannedBy;
    if (from) scannedAt.$gte = new Date(from);
    if (to) scannedAt.$lte = new Date(to);
    if (Object.keys(scannedAt).length) query.scannedAt = scannedAt;

    const skip = (page - 1) * limit;
    const [attempts, total] = await Promise.all([
        ScanAttempt.find(query)
            .sort({ scannedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('booking', 'name ticketCount bookingStatus')
            .populate('session', 'title day')
            .populate('operator', 'username role'),
        ScanAttempt.countDocuments(query),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Scan attempts fetched successfully', {
            attempts,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
        }),
    );
});

export const getScannerAnalytics = asyncHandler(async (req, res) => {
    const { from, to, sessionId, operatorId, deviceId } = req.scanQuery;
    const scannedAt = {};
    if (from) scannedAt.$gte = new Date(from);
    if (to) scannedAt.$lte = new Date(to);

    const attemptMatch = {};
    const admissionMatch = { action: ENTRY_ACTION.ENTRY };
    if (Object.keys(scannedAt).length) {
        attemptMatch.scannedAt = scannedAt;
        admissionMatch.scannedAt = scannedAt;
    }
    if (sessionId) {
        attemptMatch.session = sessionId;
        admissionMatch.session = sessionId;
    }
    if (operatorId) {
        attemptMatch.operator = new mongoose.Types.ObjectId(operatorId);
        admissionMatch.operator = new mongoose.Types.ObjectId(operatorId);
    }
    if (deviceId) {
        attemptMatch.deviceId = deviceId;
        admissionMatch.deviceId = deviceId;
    }

    const [attemptCounts, admissionCounts, admissionsBySession, recentAttempts, recentAdmissions] = await Promise.all([
        ScanAttempt.aggregate([{ $match: attemptMatch }, { $group: { _id: '$outcome', count: { $sum: 1 } } }]),
        EntryLog.aggregate([
            { $match: admissionMatch },
            { $group: { _id: null, total: { $sum: 1 }, bookings: { $addToSet: '$booking' } } },
            { $project: { _id: 0, total: 1, uniqueBookings: { $size: '$bookings' } } },
        ]),
        EntryLog.aggregate([
            { $match: admissionMatch },
            { $group: { _id: '$session', admissions: { $sum: 1 }, uniqueBookings: { $addToSet: '$booking' } } },
            { $project: { admissions: 1, uniqueBookings: { $size: '$uniqueBookings' } } },
        ]),
        ScanAttempt.find(attemptMatch)
            .sort({ scannedAt: -1 })
            .limit(20)
            .populate('booking', 'name ticketCount')
            .populate('session', 'title day')
            .populate('operator', 'username role')
            .lean(),
        EntryLog.find(admissionMatch)
            .sort({ scannedAt: -1 })
            .limit(20)
            .populate('booking', 'name ticketCount')
            .populate('session', 'title day')
            .populate('operator', 'username role')
            .lean(),
    ]);

    const attemptsByOutcome = Object.fromEntries(attemptCounts.map(({ _id, count }) => [_id, count]));
    const totals = admissionCounts[0] || { total: 0, uniqueBookings: 0 };
    const sessionIds = admissionsBySession.map(({ _id }) => _id).filter(Boolean);
    const sessionDocuments = await Session.find({ _id: { $in: sessionIds } })
        .select('title day')
        .lean();
    const sessionNames = new Map(sessionDocuments.map((session) => [String(session._id), session]));
    const recentActivity = [
        ...recentAttempts.map((attempt) => ({ ...attempt, activityType: 'SCAN_ATTEMPT' })),
        ...recentAdmissions.map((admission) => ({ ...admission, activityType: 'ADMISSION', outcome: 'ALLOWED' })),
    ]
        .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime())
        .slice(0, 20);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Scanner analytics fetched successfully', {
            filters: { from: from || null, to: to || null, sessionId: sessionId || null, operatorId: operatorId || null, deviceId: deviceId || null },
            scans: {
                total: Object.values(attemptsByOutcome).reduce((sum, count) => sum + count, 0),
                verified: attemptsByOutcome[SCAN_OUTCOME.VERIFIED] || 0,
                denied: attemptsByOutcome[SCAN_OUTCOME.DENIED] || 0,
                duplicate: attemptsByOutcome[SCAN_OUTCOME.DUPLICATE] || 0,
            },
            admissions: { total: totals.total, uniqueBookings: totals.uniqueBookings },
            bySession: admissionsBySession.map((session) => ({
                sessionId: String(session._id),
                title: sessionNames.get(String(session._id))?.title || 'Unknown session',
                day: sessionNames.get(String(session._id))?.day ?? null,
                admissions: session.admissions,
                uniqueBookings: session.uniqueBookings,
            })),
            recentActivity,
        }),
    );
});

// Export Attendees Data as CSV
export const exportAttendeesCSV = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({
        bookingStatus: {
            $in: [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN],
        },
    }).populate('selectedSessions', 'title day');

    const csvHeaders = [
        'Ticket ID',
        'Name',
        'Email',
        'Phone',
        'Ticket Count',
        'Total Amount (INR)',
        'Booking Status',
        'Checked In',
        'Checked In At',
        'Sessions',
    ];
    const rows = bookings.map((b) => {
        const sessionTitles = (b.selectedSessions || []).map((s) => s.title).join(' | ');
        const isCheckedIn = b.bookingStatus === BOOKING_STATUS.CHECKED_IN || !!b.checkedInAt ? 'Yes' : 'No';
        const checkedInAt = b.checkedInAt ? b.checkedInAt.toISOString() : 'N/A';

        return [
            `"${b.ticketId || b._id}"`,
            `"${b.name}"`,
            `"${b.email}"`,
            `"${b.phone}"`,
            b.ticketCount,
            b.totalAmount,
            `"${b.bookingStatus}"`,
            `"${isCheckedIn}"`,
            `"${checkedInAt}"`,
            `"${sessionTitles}"`,
        ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tedx_attendees.csv"');

    return res.status(StatusCodes.OK).send(csvContent);
});
