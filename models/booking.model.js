import mongoose from 'mongoose';
import { BOOKING_STATUS, MAX_TICKETS_PER_USER, RESERVATION_TIME } from '../utils/constants.js';

const bookingSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
        },

        selectedSessions: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Session',
                required: true,
            },
        ],

        ticketCount: {
            type: Number,
            required: true,
            min: 1,
            max: MAX_TICKETS_PER_USER,
        },
        totalAmount: {
            type: Number,
            required: true,
        },

        bookingStatus: {
            type: String,
            enum: Object.values(BOOKING_STATUS),
            default: BOOKING_STATUS.PENDING,
        },

        razorpayOrderId: String,
        razorpayPaymentId: String,

        ticketId: {
            type: String,
            unique: true,
            sparse: true,
        },

        qrCode: String,
        pdfUrl: String,

        reservationExpiresAt: {
            type: Date,
            default: () => new Date(Date.now() + RESERVATION_TIME),
        },

        paymentVerifiedAt: Date,
        ticketGeneratedAt: Date,
        checkedInAt: Date,

        checkedInBy: {
            type: String,
        },
    },
    {
        timestamps: true,
    },
);

bookingSchema.index(
    {
        reservationExpiresAt: 1,
    },
    {
        expireAfterSeconds: 0,
        partialFilterExpression: {
            bookingStatus: BOOKING_STATUS.PENDING,
        },
    },
);

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

export default Booking;
