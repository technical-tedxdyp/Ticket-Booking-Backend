import mongoose from 'mongoose';

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
            max: 5,
        },
        totalAmount: {
            type: Number,
            required: true,
        },

        bookingStatus: {
            type: String,
            enum: ['PENDING', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'EXPIRED', 'TICKET_GENERATED', 'CHECKED_IN'],
            default: 'PENDING',
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
            default: () => new Date(Date.now() + 10 * 60 * 1000),
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
            bookingStatus: 'PENDING',
        },
    },
);

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

export default Booking;
