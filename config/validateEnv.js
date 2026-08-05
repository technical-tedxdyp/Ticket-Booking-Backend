import { z } from 'zod';

const envSchema = z.object({
    PORT: z.string().optional(),
    NODE_ENV: z.string().optional(),
    MONGO_USER_NAME: z.string().optional(),
    MONGO_PASSWORD: z.string().optional(),
    MONGO_URI: z.string(),
    RAZORPAY_KEY_ID: z.string(),
    RAZORPAY_KEY_SECRET: z.string(),
    RAZORPAY_WEBHOOK_SECRET: z.string(),
    CLOUDINARY_CLOUD_NAME: z.string(),
    CLOUDINARY_API_KEY: z.string(),
    CLOUDINARY_API_SECRET: z.string(),
    EMAIL_USER: z.string().optional(),
    EMAIL_APP_PASSWORD: z.string().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_WHATSAPP_FROM: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string(),
    UPSTASH_REDIS_REST_TOKEN: z.string(),
    ADMIN_SECRET_KEY: z.string(),
    FRONTEND_URL: z.string().optional(),
    MAX_TICKETS_PER_USER: z.string().optional(),
    TOTAL_EVENT_CAPACITY: z.string().optional(),
});

const validateEnv = () => {
    try {
        envSchema.parse(process.env);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Environment validation failed:');
            error.errors.forEach(err => {
                console.error(`- ${err.path.join('.')}: ${err.message}`);
            });
            throw new Error('Environment validation failed');
        }
        throw error;
    }
};

export default validateEnv;
