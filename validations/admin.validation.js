import { z } from 'zod';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

const loginSchema = z
    .object({
        adminKey: z.string().optional(),
        secretKey: z.string().optional(),
        password: z.string().optional(),
    })
    .refine((data) => data.adminKey || data.secretKey || data.password, {
        message: 'Admin key or password is required.',
    });

const verifyTicketSchema = z
    .object({
        ticketId: z.string().optional(),
        bookingId: z.string().optional(),
        qrPayload: z.string().optional(),
    })
    .refine((data) => data.ticketId || data.bookingId || data.qrPayload, {
        message: 'Ticket ID, Booking ID, or QR payload is required for verification.',
    });

const checkInTicketSchema = z
    .object({
        ticketId: z.string().optional(),
        bookingId: z.string().optional(),
        qrPayload: z.string().optional(),
        sessionId: z.string().optional(),
        scannedBy: z.string().optional().default('Admin Scanner'),
        remarks: z.string().optional(),
    })
    .refine((data) => data.ticketId || data.bookingId || data.qrPayload, {
        message: 'Ticket ID, Booking ID, or QR payload is required for check-in.',
    });

export const validateAdminLogin = (req, res, next) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map((err) => err.message).join(' ');
            next(new ApiError(StatusCodes.BAD_REQUEST, messages));
        } else {
            next(error);
        }
    }
};

export const validateTicketVerify = (req, res, next) => {
    try {
        const validatedData = verifyTicketSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map((err) => err.message).join(' ');
            next(new ApiError(StatusCodes.BAD_REQUEST, messages));
        } else {
            next(error);
        }
    }
};

export const validateTicketCheckIn = (req, res, next) => {
    try {
        const validatedData = checkInTicketSchema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const messages = error.errors.map((err) => err.message).join(' ');
            next(new ApiError(StatusCodes.BAD_REQUEST, messages));
        } else {
            next(error);
        }
    }
};

export default {
    validateAdminLogin,
    validateTicketVerify,
    validateTicketCheckIn,
};
