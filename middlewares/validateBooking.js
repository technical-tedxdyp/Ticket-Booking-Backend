import { StatusCodes } from 'http-status-codes';
import { errorResponse } from '../utils/response.js';

const validateBooking = (req, res, next) => {
    const { name, email, phone, selectedSessions, ticketCount } = req.body;

    if (!name || name.trim().length < 2) {
        return errorResponse(res, StatusCodes.BAD_REQUEST, 'Name must be at least 2 characters');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return errorResponse(res, StatusCodes.BAD_REQUEST, 'Valid email address is required');
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phone || !phoneRegex.test(phone)) {
        return errorResponse(res, StatusCodes.BAD_REQUEST, 'Valid 10-digit Indian mobile number required');
    }

    if (!selectedSessions || !Array.isArray(selectedSessions) || selectedSessions.length === 0) {
        return errorResponse(res, StatusCodes.BAD_REQUEST, 'Select at least one session');
    }

    const count = parseInt(ticketCount);
    if (!count || count < 1 || count > 5) {
        return errorResponse(res, StatusCodes.BAD_REQUEST, 'Ticket count must be between 1 and 5');
    }

    next();
};

export default validateBooking;
