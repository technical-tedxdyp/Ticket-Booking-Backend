import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
    {
        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Event',
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        speakers: [
            {
                type: String,
                required: true,
            },
        ],

        day: {
            type: Number,
            enum: [1, 2],
            required: true,
        },

        startTime: {
            type: Date,
            required: true,
        },

        endTime: {
            type: Date,
            required: true,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        totalSeats: {
            type: Number,
            required: true,
        },

        reservedSeats: {
            type: Number,
            default: 0,
        },

        soldSeats: {
            type: Number,
            default: 0,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

sessionSchema.virtual('availableSeats').get(function () {
    return this.totalSeats - this.reservedSeats - this.soldSeats;
});

const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

export default Session;
