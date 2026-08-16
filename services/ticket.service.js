import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { generateTicketId } from '../utils/generateTicketId.js';
import { generateQRCode } from './qr.service.js';
import { generateTicketPDF } from './pdf.service.js';
import Booking from '../models/booking.model.js';
import { getSessionsByIds } from '../config/sessions.js';

const buildTicketData = (booking, ticketId) => {
    const sessions = [];

    if (Array.isArray(booking.selectedSessions)) {
        const staticSessions = getSessionsByIds(booking.selectedSessions);
        for (const s of staticSessions) {
            sessions.push({
                title: s.title,
                speakers: s.speakers || [],
                day: s.day ?? 1,
                timeLabel: s.timeLabel,
                startTime: s.startTime ?? null,
                endTime: s.endTime ?? null,
            });
        }
    }

    return {
        ticketId,
        name: booking.name,
        email: booking.email ?? null,
        ticketCount: booking.ticketCount ?? null,
        totalAmount: booking.totalAmount ?? null,
        eventTitle: 'TEDx DYP Akurdi 2026',
        sessions,
    };
};

export const generateTicket = async (booking) => {
    if (!booking || typeof booking !== 'object') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'A valid booking object is required to generate a ticket.');
    }

    if (!booking.name) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Booking is missing required field: name.');
    }

    if (booking.ticketId && booking.qrCode && booking.pdfUrl) {
        return {
            ticketId: booking.ticketId,
            qrCodeBuffer: null,
            pdfBuffer: null,
            ticketData: buildTicketData(booking, booking.ticketId),
            alreadyGenerated: true,
        };
    }

    const ticketId = generateTicketId();

    const qrCodeBuffer = await generateQRCode(ticketId);

    const ticketData = buildTicketData(booking, ticketId);

    const pdfBuffer = await generateTicketPDF(ticketData, qrCodeBuffer);

    return {
        ticketId,
        qrCodeBuffer,
        pdfBuffer,
        ticketData,
    };
};

export const getTicketById = async (ticketId) => {
    if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'A valid ticketId is required.');
    }

    const sanitizedTicketId = ticketId.trim();

    const booking = await Booking.findOne({ ticketId: sanitizedTicketId }).lean();

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket not found.');
    }

    if (!booking.qrCode || !booking.pdfUrl) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket has not been generated yet.');
    }

    const sessions = getSessionsByIds(booking.selectedSessions);

    return {
        ticketId: booking.ticketId,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        ticketCount: booking.ticketCount,
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        qrCode: booking.qrCode,
        pdfUrl: booking.pdfUrl,
        ticketGeneratedAt: booking.ticketGeneratedAt,
        checkedInAt: booking.checkedInAt,
        selectedSessions: sessions,
    };
};
