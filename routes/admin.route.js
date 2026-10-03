import express from 'express';
import adminAuth from '../middlewares/adminAuth.js';
import scannerAuth from '../middlewares/scannerAuth.js';
import {
    login,
    getDashboard,
    getBookings,
    getBookingById,
    verifyTicket,
    checkInTicket,
    getEntryLogs,
    getScanAttempts,
    getScannerAnalytics,
} from '../controllers/admin.controller.js';
import {
    loginWithScannerAccessCode,
    logoutScanner,
} from '../controllers/scanner-auth.controller.js';
import { validateAdminLogin, validateTicketVerify, validateTicketCheckIn } from '../validations/admin.validation.js';
import {
    validateScannerAccessCode,
    validateScanReportQuery,
    validateScannerAnalyticsQuery,
} from '../validations/scanner.validation.js';

const router = express.Router();

// Public login route
router.post('/login', validateAdminLogin, login);
router.post('/scanner/access', validateScannerAccessCode, loginWithScannerAccessCode);
router.post('/scanner/logout', scannerAuth, logoutScanner);
router.post('/scanner/ticket/verify', scannerAuth, validateTicketVerify, verifyTicket);
router.post('/scanner/ticket/check-in', scannerAuth, validateTicketCheckIn, checkInTicket);
router.get('/scanner/scan-attempts', scannerAuth, validateScanReportQuery, getScanAttempts);
router.get('/scanner/analytics/scans', scannerAuth, validateScannerAnalyticsQuery, getScannerAnalytics);

// All routes below require admin authentication
router.use(adminAuth);

// Dashboard
router.get('/dashboard', getDashboard);

// Bookings management
router.get('/bookings', getBookings);
router.get('/bookings/:id', getBookingById);

// Ticket verification and check-in
router.post('/ticket/verify', validateTicketVerify, verifyTicket);
router.post('/ticket/check-in', validateTicketCheckIn, checkInTicket);

// Entry logs
router.get('/logs', getEntryLogs);
router.get('/scan-attempts', validateScanReportQuery, getScanAttempts);
router.get('/analytics/scans', validateScannerAnalyticsQuery, getScannerAnalytics);

export default router;
