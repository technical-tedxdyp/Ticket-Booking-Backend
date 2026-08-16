import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export const redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? Redis.fromEnv()
        : null;

export const createRateLimiter = () => {
    const client = redis || Redis.fromEnv();

    return new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
        analytics: true,
    });
};
