import { StatusCodes } from 'http-status-codes';
import Session from '../models/session.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { successResponse, errorResponse } from '../utils/response.js';

// Get all active sessions
export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await Session.find({ isActive: true });

    if(!sessions || sessions.length == 0) {
        return errorResponse(res, StatusCodes.NOT_FOUND, 'No active sessions found');
    }

    return successResponse(res, StatusCodes.OK, 'Sessions fetched successfully', sessions);
});
