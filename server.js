import 'dotenv/config';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import express from 'express';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import validateEnv from './config/validateEnv.js';
import { createRateLimiter } from './services/redis.js';

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
            return res.status(429).json({
                success: false,
                message: 'Too many requests'
            });
        }
        next();
    } catch (err) {
        console.error("Rate limiter error:", err);
        next();
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API endpoints goes here
// app.use('/api/...', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);

        return res.status(400).json({
            success: false,
            message: messages.join(', ')
        });
    }

    // Duplicate key error
    if (err.code === 11000) {
        return res.status(400).json({
            success: false,
            message: 'Duplicate field value entered'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
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
