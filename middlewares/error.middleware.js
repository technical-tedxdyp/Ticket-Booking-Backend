import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';

const errorHandler = (err, req, res, next) => {
    console.error('Error: ', err);

    // If it's our custom error
    if (err instanceof Error && err.statusCode) {
        return res.status(err.statusCode).json(new ApiResponse(err.statusCode, err.message));
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map((e) => e.message);
        return res.status(StatusCodes.BAD_REQUEST).json(new ApiResponse(StatusCodes.BAD_REQUEST, messages.join(', ')));
    }

    // Duplicate key error (MongoDB)
    if (err.code === 11000) {
        return res.status(StatusCodes.BAD_REQUEST).json(new ApiResponse(StatusCodes.BAD_REQUEST, 'Duplicate field value entered'));
    }

    // Fallback
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Server Error'));
};

export default errorHandler;
