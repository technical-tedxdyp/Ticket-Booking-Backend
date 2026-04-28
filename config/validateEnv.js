const required = [
    'MONGO_URI',
    // 'RAZORPAY_KEY_ID',
    // 'RAZORPAY_KEY_SECRET',
    // 'RAZORPAY_WEBHOOK_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    // 'EMAIL_USER',
    // 'EMAIL_APP_PASSWORD',
    // 'TWILIO_ACCOUNT_SID',
    // 'TWILIO_AUTH_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'ADMIN_SECRET_KEY',
];

const validateEnv = () => {
    const missing = required.filter(key => !process.env[key]);
    if(missing.length > 0) {
        throw new Error(`Missing env vars: ${missing.join(", ")}`);
    }
};

export default validateEnv;
