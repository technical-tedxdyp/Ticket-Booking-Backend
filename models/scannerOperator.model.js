import mongoose from 'mongoose';

const scannerOperatorSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            default: null,
        },
    },
    { timestamps: true },
);

const ScannerOperator = mongoose.models.ScannerOperator || mongoose.model('ScannerOperator', scannerOperatorSchema);

export default ScannerOperator;
