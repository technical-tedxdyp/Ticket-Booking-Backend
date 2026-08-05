import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import { BOOKING_STATUS, MAX_TICKETS_PER_USER } from '../utils/constants.js';

export const createPendingBooking = async ({ name, email, phone, selectedSessions, ticketCount }) => {
    // normalize email
    email = email.toLowerCase().trim();

    // Fetch Sessions
    const sessions = await Session.find({
        _id: { $in: selectedSessions },
        isActive: true,
    });

    if (sessions.length !== selectedSessions.length) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more sessions are invalid.');
    }

    // Ticket Limit
    const existingBookings = await Booking.find({
        $or: [{ email }, { phone }],
        bookingStatus: {
            $in: [BOOKING_STATUS.PAYMENT_SUCCESS, BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN],
        },
    });

    const alreadyBooked = existingBookings.reduce((sum, booking) => sum + booking.ticketCount, 0);

    if (alreadyBooked + ticketCount > MAX_TICKETS_PER_USER) {
        throw new ApiError(StatusCodes.BAD_REQUEST, `Maximum ticket limit exceeded. Already booked ${alreadyBooked}.`);
    }

    // Seat Availability
    for (const session of sessions) {
        const available = session.totalSeats - session.reservedSeats - session.soldSeats;

        if (available < ticketCount) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `${session.title} has only ${available} seats left.`);
        }
    }

    // Reserve Seats
    for (const session of sessions) {
        session.reservedSeats += ticketCount;

        await session.save();
    }

    // Calculate Total
    const sessionPrice = sessions.reduce((sum, session) => sum + session.price, 0);

    const totalAmount = sessionPrice * ticketCount;

    // Create Pending Booking
    const booking = await Booking.create({
        name,
        email,
        phone,
        selectedSessions,
        ticketCount,
        totalAmount,
        bookingStatus: BOOKING_STATUS.PENDING,
    });

    return {
        booking,
        totalAmount,
    };
};
