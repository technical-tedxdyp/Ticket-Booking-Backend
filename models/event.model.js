import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    totalSeats: { type: Number, default: 350 },
    soldTickets: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

eventSchema.virtual('remainingSeats').get(function () {
    return this.totalSeats - this.soldTickets;
});

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

export default Event;
