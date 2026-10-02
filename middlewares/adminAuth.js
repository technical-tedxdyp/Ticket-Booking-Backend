import { timingSafeEqual } from 'node:crypto';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

const adminAuth = (req, res, next) => {
    const headerKey = req.headers['x-admin-key'];
    const authHeader = req.headers['authorization'];
    const bearerKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const providedKey = headerKey || bearerKey;
    const validSecret = process.env.ADMIN_SECRET_KEY;

    if (!validSecret || Buffer.byteLength(validSecret) < 32) {
        throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'Admin authentication is not configured with a secret of at least 32 bytes.');
    }

    const providedBuffer = Buffer.from(providedKey || '');
    const expectedBuffer = Buffer.from(validSecret);
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized admin access');
    }
    next();
};

export default adminAuth;
