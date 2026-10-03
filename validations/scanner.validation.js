import { z } from 'zod';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

const scannerAccessCodeSchema = z.object({
    accessCode: z.string().min(1).max(256),
});

const scanReportQueryBaseSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    outcome: z.enum(['VERIFIED', 'DENIED', 'DUPLICATE']).optional(),
    ticketId: z.string().trim().min(1).max(128).optional(),
    sessionId: z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .optional(),
    operatorId: z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .optional(),
    deviceId: z.string().trim().min(8).max(128).optional(),
    scannedBy: z.string().trim().min(1).max(100).optional(),
});

const validateDateRange = (query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to);
const dateRangeIssue = {
    message: 'The from date must be earlier than or equal to the to date.',
    path: ['from'],
};

export const scanReportQuerySchema = scanReportQueryBaseSchema.refine(validateDateRange, dateRangeIssue);

export const scannerAnalyticsQuerySchema = scanReportQueryBaseSchema
    .omit({ page: true, limit: true, outcome: true, ticketId: true, scannedBy: true })
    .refine(validateDateRange, dateRangeIssue);

const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        return next(new ApiError(StatusCodes.BAD_REQUEST, result.error.issues.map((issue) => issue.message).join(' ')));
    }
    req.body = result.data;
    return next();
};

export const validateScannerAccessCode = validate(scannerAccessCodeSchema);

const validateQuery = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
        return next(new ApiError(StatusCodes.BAD_REQUEST, result.error.issues.map((issue) => issue.message).join(' ')));
    }
    req.scanQuery = result.data;
    return next();
};

export const validateScanReportQuery = validateQuery(scanReportQuerySchema);
export const validateScannerAnalyticsQuery = validateQuery(scannerAnalyticsQuerySchema);
