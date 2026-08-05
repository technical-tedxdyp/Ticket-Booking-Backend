import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';

export const createPendingBooking = async ({ name, email, phone, selectedSessions, ticketCount }) => {
    // normalize email
    email = email.toLowerCase().trim();

    // Fetch Sessions
    const sessions = await Session.find({
        _id: { $in: selectedSessions },
        isActive: true,
    });

    if (sessions.length !== selectedSessions.length) {
        throw new Error('One or more sessions are invalid.');
    }

    // Ticket Limit
    const existingBookings = await Booking.find({
        $or: [{ email }, { phone }],
        bookingStatus: {
            $in: ['PAYMENT_SUCCESS', 'TICKET_GENERATED', 'CHECKED_IN'],
        },
    });

    const alreadyBooked = existingBookings.reduce((sum, booking) => sum + booking.ticketCount, 0);

    if (alreadyBooked + ticketCount > 5) {
        throw new Error(`Maximum ticket limit exceeded. Already booked ${alreadyBooked}.`);
    }

    // Seat Availability
    for (const session of sessions) {
        const available = session.totalSeats - session.reservedSeats - session.soldSeats;

        if (available < ticketCount) {
            throw new Error(`${session.title} has only ${available} seats left.`);
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
        bookingStatus: 'PENDING',
    });

    return {
        booking,
        totalAmount,
    };
};
