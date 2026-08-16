import { asyncHandler } from '../utils/asyncHandler.js';
import { getTicketById } from '../services/ticket.service.js';
import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';

export const getTicket = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;

    const ticket = await getTicketById(ticketId);

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, 'Ticket retrived successfully', {
            data:ticket
        })
    );
    
});