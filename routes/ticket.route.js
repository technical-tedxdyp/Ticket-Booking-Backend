import express from 'express';
import { downloadTicketPdf, getTicket } from '../controllers/ticket.controller.js';

const router = express.Router();

router.get('/:ticketId/pdf', downloadTicketPdf);
router.get('/:ticketId', getTicket);

export default router;
