import express from 'express';
import { getTicket } from '../controllers/ticket.controller.js';

const router = express.Router();

router.get('/:ticketId', getTicket);

export default router;
