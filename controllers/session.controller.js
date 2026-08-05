import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import Session from '../models/session.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Get all active sessions
export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await Session.find({ isActive: true });

    if(!sessions || sessions.length == 0) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'No active sessions found');
    }

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Sessions fetched successfully', sessions));
});
