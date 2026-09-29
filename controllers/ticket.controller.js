import { asyncHandler } from '../utils/asyncHandler.js';
import { getTicketById, getTicketPdfById } from '../services/ticket.service.js';
import { StatusCodes } from 'http-status-codes';
import ApiResponse from '../utils/ApiResponse.js';

export const getTicket = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;

    const ticket = await getTicketById(ticketId);

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, 'Ticket retrived successfully', {
            data: ticket,
        }),
    );
});

export const downloadTicketPdf = asyncHandler(async (req, res) => {
    const pdfBuffer = await getTicketPdfById(req.params.ticketId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="TEDx_Ticket.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(StatusCodes.OK).send(pdfBuffer);
});
