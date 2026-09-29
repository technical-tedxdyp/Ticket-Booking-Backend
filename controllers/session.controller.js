import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Session from '../models/session.model.js';

export const getSessions = asyncHandler(async (req, res) => {
    const sessions = await Session.find({ isActive: true }).sort({ day: 1, startTime: 1 });

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Sessions fetched successfully', sessions));
});

export const getSessionById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || !Session.base.Types.ObjectId.isValid(id)) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Session not found');
    }

    const session = await Session.findOne({ _id: id, isActive: true });
    if (!session) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Session not found');
    }
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Session fetched successfully', session));
});
