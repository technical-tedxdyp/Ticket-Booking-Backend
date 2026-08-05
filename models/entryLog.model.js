import mongoose from 'mongoose';
import { ENTRY_ACTION } from '../utils/constants.js';

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
            enum: Object.values(ENTRY_ACTION),
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
