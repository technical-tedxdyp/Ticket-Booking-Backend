import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const isValidUpstashUrl = (value) => {
    if (!value || typeof value !== 'string') return false;

    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !!url.hostname;
    } catch {
        return false;
    }
};

const hasUpstashConfig = Boolean(isValidUpstashUrl(process.env.UPSTASH_REDIS_REST_URL) && process.env.UPSTASH_REDIS_REST_TOKEN);

export const redis = hasUpstashConfig ? Redis.fromEnv() : null;

const noOpRateLimiter = {
    limit: async () => ({ success: true, reset: Date.now() + 1000 }),
};

const safeRateLimitCall = async (limiter, identifier) => {
    try {
        if (!limiter || !identifier) {
            return { success: true, reset: Date.now() + 1000 };
        }

        return await limiter.limit(identifier);
    } catch (error) {
        console.warn('Upstash rate limiter unavailable, using no-op fallback.', error?.message || error);
        return { success: true, reset: Date.now() + 1000 };
    }
};

export const createRateLimiter = () => {
    if (!redis) {
        return noOpRateLimiter;
    }

    try {
        const limiter = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(10, '10 s'),
            analytics: true,
        });

        return {
            limit: async (identifier) => safeRateLimitCall(limiter, identifier),
        };
    } catch (error) {
        console.error('Rate limiter initialization error:', error?.message || error);
        return noOpRateLimiter;
    }
};
