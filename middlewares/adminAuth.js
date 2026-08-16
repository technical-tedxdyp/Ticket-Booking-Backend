import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

const adminAuth = (req, res, next) => {
    const headerKey = req.headers['x-admin-key'];
    const authHeader = req.headers['authorization'];
    const bearerKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const queryKey = req.query?.adminKey || req.query?.key;

    const providedKey = headerKey || bearerKey || queryKey;
    const validSecret = process.env.ADMIN_SECRET_KEY || 'TEDX_ADMIN_SECRET_KEY';

    if (!providedKey || providedKey !== validSecret) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized admin access');
    }
    next();
};

export default adminAuth;
