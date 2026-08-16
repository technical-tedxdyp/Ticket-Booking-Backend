import QRCode from 'qrcode';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

export const generateQRCode = async (ticketId) => {
    if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'A valid ticketId is required to generate a QR code.');
    }

    const payload = JSON.stringify({ ticketId: ticketId.trim() });

    const buffer = await QRCode.toBuffer(payload, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 300,
    });

    return buffer;
};
