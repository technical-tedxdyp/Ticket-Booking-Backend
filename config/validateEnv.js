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
        RAZORPAY_KEY_ID: z.string(),
        RAZORPAY_KEY_SECRET: z.string(),
        RAZORPAY_WEBHOOK_SECRET: z.string(),
        CLOUDINARY_CLOUD_NAME: z.string(),
        CLOUDINARY_API_KEY: z.string(),
        CLOUDINARY_API_SECRET: z.string(),
        EMAIL_PROVIDER: z.enum(['resend', 'mailtrap']).default('resend'),
        RESEND_API_KEY: z.string().optional().default(''),
        MAILTRAP_API_TOKEN: z.string().optional(),
        MAILTRAP_HOST: z.string().optional(),
        MAILTRAP_PORT: z.coerce.number().int().positive().optional(),
        MAILTRAP_USER: z.string().optional(),
        MAILTRAP_PASSWORD: z.string().optional(),
        EMAIL_FROM: z.string(),
        TWILIO_ACCOUNT_SID: z.string().optional(),
        TWILIO_AUTH_TOKEN: z.string().optional(),
        TWILIO_WHATSAPP_FROM: z.string().optional(),
        UPSTASH_REDIS_REST_URL: z.string(),
        UPSTASH_REDIS_REST_TOKEN: z.string(),
        ADMIN_SECRET_KEY: z.string().min(32),
        SCANNER_TOKEN_SECRET: z.string().min(32),
        SCANNER_ACCESS_CODE: z.string().min(8),
        FRONTEND_URL: z.string(),
    })
    .superRefine((env, ctx) => {
        if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['RESEND_API_KEY'],
                message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is resend',
            });
        }

        if (env.EMAIL_PROVIDER === 'mailtrap') {
            if (!env.EMAIL_FROM.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['EMAIL_FROM'],
                    message: 'EMAIL_FROM must be a verified sender when EMAIL_PROVIDER is mailtrap',
                });
            }

            if (!env.MAILTRAP_API_TOKEN && (!env.MAILTRAP_USER || !env.MAILTRAP_PASSWORD)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['MAILTRAP_API_TOKEN'],
                    message: 'MAILTRAP_API_TOKEN or both MAILTRAP_USER and MAILTRAP_PASSWORD are required when EMAIL_PROVIDER is mailtrap',
                });
            }
        }

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

        if (env.IS_RAZOR_PAY_ENABLE && !env.RAZORPAY_WEBHOOK_SECRET) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['RAZORPAY_WEBHOOK_SECRET'],
                message: 'RAZORPAY_WEBHOOK_SECRET is required when IS_RAZOR_PAY_ENABLE is true',
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
