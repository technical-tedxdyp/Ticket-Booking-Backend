import express from 'express';
import adminAuth from '../middlewares/adminAuth.js';
import { login, getDashboard, verifyTicket, checkInTicket } from '../controllers/admin.controller.js';

const router = express.Router();

router.post('/login', login);

router.use(adminAuth);

router.get('/dashboard', getDashboard);
router.post('/ticket/verify', verifyTicket);
router.post('/ticket/check-in', checkInTicket);

export default router;
