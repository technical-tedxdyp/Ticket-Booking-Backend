import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export const createRateLimiter = () => {
    const redis = Redis.fromEnv();

    return new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
        analytics: true,
    });
};
