import express from 'express';
import adminAuth from '../middlewares/adminAuth.js';
import { login, getDashboard, getBookings, getBookingById, verifyTicket, checkInTicket, getEntryLogs } from '../controllers/admin.controller.js';
import { validateAdminLogin, validateTicketVerify, validateTicketCheckIn } from '../validations/admin.validation.js';

const router = express.Router();

// Public login route
router.post('/login', validateAdminLogin, login);

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

export default router;
