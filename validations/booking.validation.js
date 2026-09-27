import { z } from 'zod';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { MAX_TICKETS_PER_USER } from '../utils/constants.js';

import { VALID_SESSION_IDS } from '../config/sessions.js';

const bookingSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
    email: z.string().trim().toLowerCase().email('Valid email address is required.'),
    phone: z
        .string()
        .trim()
        .regex(/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile number required.'),
    selectedSessions: z
        .array(z.string().trim())
        .min(1, 'Select at least one session.')
        .refine(
            (sessions) =>
                Array.isArray(sessions) &&
                sessions.every((s) => VALID_SESSION_IDS.includes(String(s).toLowerCase()) || /^[0-9a-fA-F]{24}$/.test(String(s))),
            { message: `Invalid session selected. Valid sessions are: ${VALID_SESSION_IDS.join(', ')}` },
        )
        .refine(
            (sessions) => {
                if (!Array.isArray(sessions)) return false;
                return new Set(sessions.map((s) => String(s).toLowerCase())).size === sessions.length;
            },
            { message: 'Duplicate sessions are not allowed.' },
        ),
    ticketCount: z.coerce
        .number()
        .min(1, `Ticket count must be at least 1.`)
        .max(MAX_TICKETS_PER_USER, `Ticket count must be between 1 and ${MAX_TICKETS_PER_USER}.`),
});

const getZodMessages = (error) => {
    const issues = Array.isArray(error?.issues) ? error.issues : Array.isArray(error?.errors) ? error.errors : [];
    return issues.map((err) => err?.message || 'Validation failed').join(' ');
};

const validateBooking = (req, res, next) => {
    try {
        const validatedData = bookingSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(new ApiError(StatusCodes.BAD_REQUEST, getZodMessages(error)));
        } else {
            next(error);
        }
    }
};

const bookingIdSchema = z.object({
    bookingId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid booking ID format.'),
});

export const validateBookingId = (req, res, next) => {
    try {
        bookingIdSchema.parse(req.params);
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(new ApiError(StatusCodes.BAD_REQUEST, getZodMessages(error)));
        } else {
            next(error);
        }
    }
};

export default validateBooking;
