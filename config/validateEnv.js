import { z } from 'zod';

const parseBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    return false;
};

const envSchema = z
    .object({
        PORT: z.string(),
        NODE_ENV: z.string(),
        MONGO_USER_NAME: z.string(),
        MONGO_PASSWORD: z.string(),
        MONGO_URI: z.string(),
        IS_RAZOR_PAY_ENABLE: z.preprocess((value) => parseBoolean(value), z.boolean()).default(false),
        RAZORPAY_KEY_ID: z.string().optional(),
        RAZORPAY_KEY_SECRET: z.string().optional(),
        RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
        CLOUDINARY_CLOUD_NAME: z.string(),
        CLOUDINARY_API_KEY: z.string(),
        CLOUDINARY_API_SECRET: z.string(),
        RESEND_API_KEY: z.string(),
        EMAIL_FROM: z.string(),
        TWILIO_ACCOUNT_SID: z.string().optional(),
        TWILIO_AUTH_TOKEN: z.string().optional(),
        TWILIO_WHATSAPP_FROM: z.string().optional(),
        UPSTASH_REDIS_REST_URL: z.string(),
        UPSTASH_REDIS_REST_TOKEN: z.string(),
        ADMIN_SECRET_KEY: z.string(),
        FRONTEND_URL: z.string().optional(),
    })
    .superRefine((env, ctx) => {
        if (env.IS_RAZOR_PAY_ENABLE && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['RAZORPAY_KEY_ID'],
                message: 'RAZORPAY_KEY_ID is required when IS_RAZOR_PAY_ENABLE is true',
            });
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['RAZORPAY_KEY_SECRET'],
                message: 'RAZORPAY_KEY_SECRET is required when IS_RAZOR_PAY_ENABLE is true',
            });
        }
    });

const validateEnv = () => {
    try {
        envSchema.parse(process.env);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Environment validation failed:');
            error.errors.forEach((err) => {
                console.error(`- ${err.path.join('.')}: ${err.message}`);
            });
            throw new Error('Environment validation failed');
        }
        throw error;
    }
};

export default validateEnv;
