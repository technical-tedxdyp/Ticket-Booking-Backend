import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import Booking from '../models/booking.model.js';
import { BOOKING_STATUS, MAX_TICKETS_PER_USER } from '../utils/constants.js';
import { getSessionsByIds, calculateSessionsTotalPrice } from '../config/sessions.js';

export const createPendingBooking = async ({ name, email, phone, selectedSessions, ticketCount }) => {
    // normalize email
    email = email.toLowerCase().trim();

    // Normalize selected sessions
    const sessionIds = selectedSessions.map((s) => String(s).toLowerCase().trim());
    const validSessions = getSessionsByIds(sessionIds);

    if (validSessions.length !== sessionIds.length) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'One or more selected sessions are invalid.');
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

    // Calculate Total Price
    const perTicketPrice = calculateSessionsTotalPrice(sessionIds);
    const totalAmount = perTicketPrice * ticketCount;

    // Create Pending Booking
    const booking = await Booking.create({
        name,
        email,
        phone,
        selectedSessions: sessionIds,
        ticketCount,
        totalAmount,
        bookingStatus: BOOKING_STATUS.PENDING,
    });

    return {
        booking,
        totalAmount,
    };
};
