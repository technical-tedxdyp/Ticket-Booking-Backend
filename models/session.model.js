import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    speakers: { type: [String], required: true },
    startTime: { type: Date, required: true },
    endTime: {
        type: Date,
        required: true,
        validate: {
            validator: function (value) {
                return value > this.startTime;
            },
            message: 'End time must be after start time',
        },
    },
    price: { type: Number, required: true },
    maxSeats: { type: Number, required: true },
    bookedSeats: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
 });

sessionSchema.virtual('remainingSeats').get(function () {
    return this.maxSeats - this.bookedSeats;
});

const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

export default Session;
