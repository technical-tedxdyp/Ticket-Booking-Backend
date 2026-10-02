import mongoose from 'mongoose';

const scannerOperatorSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 40,
        },
        passwordHash: {
            type: String,
            required: true,
            select: false,
        },
        role: {
            type: String,
            enum: ['SCANNER', 'SUPERVISOR'],
            default: 'SCANNER',
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

const ScannerOperator = mongoose.models.ScannerOperator || mongoose.model('ScannerOperator', scannerOperatorSchema);

export default ScannerOperator;
