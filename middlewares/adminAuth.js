import { StatusCodes } from 'http-status-codes';
import { errorResponse } from '../utils/response.js';

const adminAuth = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (!key || key !== process.env.ADMIN_SECRET_KEY) {
        return errorResponse(res, StatusCodes.UNAUTHORIZED, 'Unauthorized');
    }
    next();
};

export default adminAuth;
