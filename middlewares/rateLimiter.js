import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';
import { createRateLimiter } from '../providers/redis.js';

const noOpRateLimiter = {
    limit: async () => ({ success: true, reset: Date.now() + 1000 }),
};

export const ratelimit = createRateLimiter();

// Use as Express middleware on any route
export const rateLimitMiddleware = async (req, res, next) => {
    try {
        const limiter = ratelimit || noOpRateLimiter;

        // Identify by email if present, fall back to IP
        const identifier = req.body && req.body.email ? req.body.email.toLowerCase() : req.ip;

        const { success, reset } = await limiter.limit(identifier);

        if (!success) {
            const retryAfter = Math.ceil((reset - Date.now()) / 1000);
            return res
                .status(StatusCodes.TOO_MANY_REQUESTS)
                .json(new ApiResponse(StatusCodes.TOO_MANY_REQUESTS, `Too many requests. Try again in ${retryAfter} seconds.`));
        }
        next();
    } catch (err) {
        // If Upstash is down, don't block the user — just log and continue
        console.warn('Rate limiter error:', err?.message || err);
        next();
    }
};
