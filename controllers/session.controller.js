import Session from '../models/session.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Get all active sessions
export const getSessions = asyncHandler(async(req, res) => {
    const sessions = await Session.find({ isActive: true });

    if(!sessions || sessions.length == 0) {
        return res.status(404).json({
            success: false,
            message: 'No active sessions found',
        });
    }

    res.status(200).json({
        success: true,
        data: sessions,
    });
});
