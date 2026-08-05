import mongoose from 'mongoose';

const entryLogSchema = new mongoose.Schema(
    {
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking',
            required: true,
        },

        ticketId: {
            type: String,
            required: true,
        },

        session: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Session',
            required: true,
        },

        action: {
            type: String,
            enum: ['ENTRY', 'RE_ENTRY'],
            required: true,
        },

        scannedBy: {
            type: String,
            required: true,
        },

        scannedAt: {
            type: Date,
            default: Date.now,
        },

        remarks: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    },
);

const EntryLog = mongoose.models.EntryLog || mongoose.model('EntryLog', entryLogSchema);

export default EntryLog;
