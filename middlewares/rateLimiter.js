import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: false,
});

// Use as Express middleware on any route
export const rateLimitMiddleware = async (req, res, next) => {
    try {
        // Identify by email if present, fall back to IP
        const identifier = req.body && req.body.email ? req.body.email.toLowerCase() : req.ip;

        const { success, reset } = await ratelimit.limit(identifier);

        if (!success) {
            const retryAfter = Math.ceil((reset - Date.now()) / 1000);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Try again in ${retryAfter} seconds.`,
            });
        }
        next();
    } catch (err) {
        // If Upstash is down, don't block the user — just log and continue
        console.error('Rate limiter error:', err.message);
        next();
    }
};
