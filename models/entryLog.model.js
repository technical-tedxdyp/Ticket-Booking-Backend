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
            type: String,
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

        operator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ScannerOperator',
            default: null,
        },

        deviceId: {
            type: String,
            default: null,
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

entryLogSchema.index({ booking: 1, session: 1, action: 1 }, { unique: true, partialFilterExpression: { action: ENTRY_ACTION.ENTRY } });

const EntryLog = mongoose.models.EntryLog || mongoose.model('EntryLog', entryLogSchema);

export default EntryLog;
