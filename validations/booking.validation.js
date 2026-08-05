import { z } from 'zod';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { MAX_TICKETS_PER_USER } from '../utils/constants.js';

const bookingSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
    email: z.string().trim().toLowerCase().email('Valid email address is required.'),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile number required.'),
    selectedSessions: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid session ID format.')).min(1, 'Select at least one session.'),
    ticketCount: z.coerce.number().min(1, `Ticket count must be at least 1.`).max(MAX_TICKETS_PER_USER, `Ticket count must be between 1 and ${MAX_TICKETS_PER_USER}.`),
});

const validateBooking = (req, res, next) => {
    try {
        const validatedData = bookingSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map(err => err.message).join(' ');
            next(new ApiError(StatusCodes.BAD_REQUEST, messages));
        } else {
            next(error);
        }
    }
};

export default validateBooking;
