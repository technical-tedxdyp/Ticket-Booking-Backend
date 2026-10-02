import mongoose from 'mongoose';
import { SCAN_OUTCOME } from '../utils/constants.js';

const scanAttemptSchema = new mongoose.Schema(
    {
        ticketId: {
            type: String,
            required: true,
            maxlength: 128,
        },
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking',
            default: null,
        },
        session: {
            type: String,
            ref: 'Session',
            default: null,
        },
        outcome: {
            type: String,
            enum: Object.values(SCAN_OUTCOME),
            required: true,
        },
        reason: {
            type: String,
            default: '',
            maxlength: 500,
        },
        scannedBy: {
            type: String,
            required: true,
            maxlength: 100,
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
    },
    { timestamps: true },
);

scanAttemptSchema.index({ scannedAt: -1 });
scanAttemptSchema.index({ outcome: 1, scannedAt: -1 });
scanAttemptSchema.index({ booking: 1, scannedAt: -1 });

const ScanAttempt = mongoose.models.ScanAttempt || mongoose.model('ScanAttempt', scanAttemptSchema);

export default ScanAttempt;
