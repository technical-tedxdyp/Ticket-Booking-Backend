import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    sessions: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
        validate: [arr => arr.length > 0, 'At least one session is required'],
    },
    ticketCount: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    totalAmount: {
        type: Number,
        required: true
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    ticketId: {
        type: String,
        unique: true,
        sparse: true
    },
    qrCodeDataUrl: { type: String },
    pdfUrl: { type: String },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending',
    },
    isCheckedIn: {
        type: Boolean,
        default: false
    },
    checkedInAt: { type: Date },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 15 * 60 * 1000),
        index: { expireAfterSeconds: 0 },
    },
}, { timestamps: true });

// Remove TTL when payment is confirmed
bookingSchema.pre('save', function (next) {
    if (this.paymentStatus === 'paid') {
        this.expiresAt = undefined;
    }
    next();
});

// Prevent over booking
bookingSchema.pre('validate', async function (next) {
    try {
        const sessions = await mongoose.model('Session').find({
            _id: { $in: this.sessions }
        });
        for (const session of sessions) {
            if(session.bookedSeats + this.ticketCount > session.maxSeats) {
                return next(new Error(`Not enough seats in session: ${session.title}`));
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

export default Booking;
