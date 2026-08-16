import { asyncHandler } from '../utils/asyncHandler.js';
import { getTicketById } from '../services/ticket.service.js';
import { StatusCodes } from 'http-status-codes';

export const getTicket = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;

    const ticket = await getTicketById(ticketId);

    return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Ticket retrieved successfully.',
        data: ticket,
    });
});