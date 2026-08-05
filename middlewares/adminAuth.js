import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

const adminAuth = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_SECRET_KEY) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
    }
    next();
};

export default adminAuth;
