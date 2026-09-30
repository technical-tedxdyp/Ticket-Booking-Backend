import { BOOKING_STATUS } from '../utils/constants.js';

const getIdString = (value) => {
    const id = value && typeof value === 'object' && value._id ? value._id : value;
    return id?.toString();
};

export const collectSeatSessionIds = (sessions = []) => [
    ...new Set(
        sessions
            .flatMap((session) => [session._id, ...(session.includedSessions || [])])
            .map(getIdString)
            .filter(Boolean),
    ),
];

export const hasSelectedIncludedSession = (sessions = []) => {
    const selectedIds = new Set(sessions.map((session) => getIdString(session._id)));
    return sessions.some((session) => (session.includedSessions || []).some((included) => selectedIds.has(getIdString(included))));
};

export const getBookingSeatSessionIds = (booking) => {
    const storedIds = booking.seatSessionIds?.length ? booking.seatSessionIds : booking.selectedSessions;
    return [...new Set(storedIds.map(getIdString).filter(Boolean))];
};

export const countPendingReservations = (bookings = []) => {
    const reservations = new Map();

    for (const booking of bookings) {
        if (booking.bookingStatus !== BOOKING_STATUS.PENDING || booking.ticketCount < 1) continue;

        for (const sessionId of getBookingSeatSessionIds(booking)) {
            reservations.set(sessionId, (reservations.get(sessionId) || 0) + booking.ticketCount);
        }
    }

    return reservations;
};
