import { StatusCodes } from 'http-status-codes';
import { errorResponse } from '../utils/response.js';

const errorHandler = (err, req, res, next) => {
    console.error('Error: ', err);

    // If it's our custom error
    if (err instanceof Error && err.statusCode) {
        return errorResponse(res, err.statusCode, err.message);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map((e) => e.message);
        return errorResponse(res, StatusCodes.BAD_REQUEST, messages.join(', '));
    }

    // Duplicate key error (MongoDB)
    if (err.code === 11000) {
        return errorResponse(res, StatusCodes.BAD_REQUEST, 'Duplicate field value entered');
    }

    // Fallback
    return errorResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Server Error');
};

export default errorHandler;
