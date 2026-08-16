import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { STATIC_SESSIONS, getSessionById as findSessionById } from '../config/sessions.js';

// Get all active sessions (Static Morning and Evening sessions)
export const getSessions = asyncHandler(async (req, res) => {
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Sessions fetched successfully', STATIC_SESSIONS)
    );
});

// Get session by ID (Morning or Evening)
export const getSessionById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const session = findSessionById(id?.toLowerCase());
    if (!session) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Session not found');
    }
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Session fetched successfully', session)
    );
});

