import mongoose from 'mongoose';

const scannerDeviceSchema = new mongoose.Schema(
    {
        deviceId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 8,
            maxlength: 128,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        secretHash: {
            type: String,
            required: true,
            select: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        tokenVersion: {
            type: Number,
            default: 0,
        },
        lastLoginAt: Date,
    },
    { timestamps: true },
);

const ScannerDevice = mongoose.models.ScannerDevice || mongoose.model('ScannerDevice', scannerDeviceSchema);

export default ScannerDevice;
