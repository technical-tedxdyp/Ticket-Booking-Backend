import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import { processExpiredBookings, removeBookingExpiryTtlIndex } from '../services/booking.service.js';
import { countPendingReservations } from '../services/session-capacity.service.js';

const reconcileReservedSeats = async () => {
    try {
        await connectDB();
        await removeBookingExpiryTtlIndex();
        await processExpiredBookings();

        const pendingBookings = await Booking.find({ bookingStatus: 'PENDING' })
            .select('bookingStatus ticketCount selectedSessions seatSessionIds')
            .lean();
        const reservations = countPendingReservations(pendingBookings);
        const sessions = await Session.find().select('_id').lean();

        if (sessions.length > 0) {
            await Session.bulkWrite(
                sessions.map(({ _id }) => ({
                    updateOne: {
                        filter: { _id },
                        update: { $set: { reservedSeats: reservations.get(_id.toString()) || 0 } },
                    },
                })),
            );
        }

        console.log(`Reconciled reserved seat counts for ${sessions.length} sessions.`);
        for (const [sessionId, count] of reservations) {
            console.log(`${sessionId}: ${count} reserved`);
        }
    } finally {
        await mongoose.connection.close();
    }
};

reconcileReservedSeats().catch((error) => {
    console.error('Reserved-seat reconciliation failed:', error);
    process.exitCode = 1;
});
