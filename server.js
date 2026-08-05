import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import express from 'express';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { StatusCodes } from 'http-status-codes';
import ApiResponse from './utils/ApiResponse.js';
import validateEnv from './config/validateEnv.js';
import sessionRoutes from './routes/session.route.js';
import bookingRoutes from './routes/booking.route.js';
import { createRateLimiter } from './providers/redis.js';
import errorHandler from './middlewares/error.middleware.js';

const app = express();

// Middlewares
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Security & logging
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: process.env.FRONTEND_URL || true }));

// Rate limiter
const rateLimit = createRateLimiter();
app.use(async (req, res, next) => {
    try {
        const ip = (req.headers['x-forwarded-for'] || req.ip || "").split(',')[0].trim();
        const { success } = await rateLimit.limit(ip);
        if (!success) {
            return res.status(StatusCodes.TOO_MANY_REQUESTS).json(new ApiResponse(StatusCodes.TOO_MANY_REQUESTS, 'Too many requests'));
        }
        next();
    } catch (err) {
        console.error("Rate limiter error:", err);
        next();
    }
});

// Health check
app.get('/health', (req, res) => {
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Server is healthy', { status: 'ok' }));
});

// API endpoints goes here
app.use('/api/session', sessionRoutes);
app.use('/api/booking', bookingRoutes);

// Error handler middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, 'Route not found'));
});

// Start server
const startServer = async () => {
    try {
        validateEnv();
        await connectDB();

        const PORT = process.env.PORT || 8080;
        const server = app.listen(PORT, () => {
            console.log(`Server started on port ${PORT}`);
        });

        const shutdown = async () => {
            console.log('Shutting down server...');
            await mongoose.connection.close();
            server.close(() => {
                process.exit(0);
            });
        }

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    } catch (error) {
        console.error('Startup error: ', error.message);
        process.exit(1);
    }
}

startServer();
