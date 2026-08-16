import mongoose from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Booking from '../models/booking.model.js';
import EntryLog from '../models/entryLog.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BOOKING_STATUS, ENTRY_ACTION } from '../utils/constants.js';

// Admin Login
export const login = asyncHandler(async (req, res) => {
    const { adminKey, secretKey, password } = req.body;
    const providedKey = adminKey || secretKey || password;
    const validSecret = process.env.ADMIN_SECRET_KEY || 'TEDX_ADMIN_SECRET_KEY';

    if (providedKey !== validSecret) {
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
    const sessionStats = sessions.map((session) => ({
        id: session._id,
        title: session.title,
        day: session.day,
        totalSeats: session.totalSeats,
        reservedSeats: session.reservedSeats,
        soldSeats: session.soldSeats,
        availableSeats: session.totalSeats - session.reservedSeats - session.soldSeats,
    }));

    // Recent 5 bookings
    const recentBookings = await Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('selectedSessions', 'title day startTime endTime');

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
        Booking.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('selectedSessions', 'title day startTime endTime price'),
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

    const query = mongoose.Types.ObjectId.isValid(id)
        ? { $or: [{ _id: id }, { ticketId: id }] }
        : { ticketId: id };

    const booking = await Booking.findOne(query).populate('selectedSessions');

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Booking not found');
    }

    const entryLogs = await EntryLog.find({ booking: booking._id })
        .sort({ scannedAt: -1 })
        .populate('session', 'title day');

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Booking details fetched successfully', {
            booking,
            entryLogs,
        }),
    );
});

// Verify Ticket by ticketId / bookingId / qrPayload
export const verifyTicket = asyncHandler(async (req, res) => {
    const { ticketId, bookingId, qrPayload } = req.body;
    const identifier = ticketId || bookingId || qrPayload;

    const query = mongoose.Types.ObjectId.isValid(identifier)
        ? { $or: [{ _id: identifier }, { ticketId: identifier }, { qrCode: identifier }] }
        : { $or: [{ ticketId: identifier }, { qrCode: identifier }] };

    const booking = await Booking.findOne(query).populate('selectedSessions', 'title day startTime endTime');

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket or Booking not found');
    }

    const validStatuses = [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN];
    const isPaid = validStatuses.includes(booking.bookingStatus);

    if (!isPaid) {
        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, 'Ticket verification result', {
                valid: false,
                reason: `Booking is currently ${booking.bookingStatus}. Payment not confirmed.`,
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

    const alreadyCheckedIn = booking.bookingStatus === BOOKING_STATUS.CHECKED_IN || !!booking.checkedInAt;

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Ticket verified successfully', {
            valid: true,
            alreadyCheckedIn,
            checkedInAt: booking.checkedInAt || null,
            checkedInBy: booking.checkedInBy || null,
            booking: {
                id: booking._id,
                ticketId: booking.ticketId,
                name: booking.name,
                email: booking.email,
                phone: booking.phone,
                ticketCount: booking.ticketCount,
                bookingStatus: booking.bookingStatus,
                selectedSessions: booking.selectedSessions,
                qrCode: booking.qrCode,
                pdfUrl: booking.pdfUrl,
            },
        }),
    );
});

// Check-in Ticket
export const checkInTicket = asyncHandler(async (req, res) => {
    const { ticketId, bookingId, qrPayload, sessionId, scannedBy = 'Admin Scanner', remarks } = req.body;
    const identifier = ticketId || bookingId || qrPayload;

    const query = mongoose.Types.ObjectId.isValid(identifier)
        ? { $or: [{ _id: identifier }, { ticketId: identifier }, { qrCode: identifier }] }
        : { $or: [{ ticketId: identifier }, { qrCode: identifier }] };

    const booking = await Booking.findOne(query).populate('selectedSessions', 'title day');

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket or Booking not found');
    }

    const validStatuses = [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED];
    if (!validStatuses.includes(booking.bookingStatus)) {
        if (booking.bookingStatus === BOOKING_STATUS.CHECKED_IN) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Ticket has already been checked in');
        }
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            `Cannot check-in booking with status ${booking.bookingStatus}. Payment must be successful.`,
        );
    }

    const targetSessionId = sessionId || (booking.selectedSessions && booking.selectedSessions.length > 0 ? booking.selectedSessions[0]._id : null);

    // Mark as checked in
    booking.bookingStatus = BOOKING_STATUS.CHECKED_IN;
    booking.checkedInAt = new Date();
    booking.checkedInBy = scannedBy;
    await booking.save();

    // Create EntryLog record
    const entryLog = await EntryLog.create({
        booking: booking._id,
        ticketId: booking.ticketId || String(booking._id),
        session: targetSessionId,
        action: ENTRY_ACTION.ENTRY,
        scannedBy,
        scannedAt: new Date(),
        remarks: remarks || 'Initial event check-in',
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Check-in completed successfully', {
            success: true,
            checkedInAt: booking.checkedInAt,
            booking: {
                id: booking._id,
                ticketId: booking.ticketId,
                name: booking.name,
                email: booking.email,
                phone: booking.phone,
                ticketCount: booking.ticketCount,
                bookingStatus: booking.bookingStatus,
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
            .populate('session', 'title day'),
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

// Export Attendees Data as CSV
export const exportAttendeesCSV = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({
        bookingStatus: {
            $in: [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN],
        },
    }).populate('selectedSessions', 'title day');

    const csvHeaders = ['Ticket ID', 'Name', 'Email', 'Phone', 'Ticket Count', 'Total Amount (INR)', 'Booking Status', 'Checked In', 'Checked In At', 'Sessions'];
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
