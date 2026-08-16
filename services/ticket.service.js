import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { generateTicketId } from '../utils/generateTicketId.js';
import { generateQRCode } from './qr.service.js';
import { generateTicketPDF } from './pdf.service.js';
import Booking from '../models/booking.model.js';

const buildTicketData = (booking, ticketId) => {
    const sessions = [];

    if (Array.isArray(booking.selectedSessions)) {
        for (const s of booking.selectedSessions) {
            if (s && typeof s === 'object' && s.title) {
                sessions.push({
                    title: s.title,
                    speakers: s.speakers || [],
                    day: s.day ?? null,
                    startTime: s.startTime ?? null,
                    endTime: s.endTime ?? null,
                });
            }
        }
    }

    let eventTitle = null;
    let eventStart = null;
    let eventEnd = null;

    if (sessions.length === 0 && booking.selectedSessions?.[0]) {
        const firstSession = booking.selectedSessions[0];
        if (firstSession?.event && typeof firstSession.event === 'object') {
            eventTitle = firstSession.event.title ?? null;
            eventStart = firstSession.event.startDate ?? null;
            eventEnd = firstSession.event.endDate ?? null;
        }
    } else if (booking.selectedSessions?.[0]?.event && typeof booking.selectedSessions[0].event === 'object') {
        eventTitle = booking.selectedSessions[0].event.title ?? null;
        eventStart = booking.selectedSessions[0].event.startDate ?? null;
        eventEnd = booking.selectedSessions[0].event.endDate ?? null;
    }

    return {
        ticketId,
        name: booking.name,
        email: booking.email ?? null,
        ticketCount: booking.ticketCount ?? null,
        totalAmount: booking.totalAmount ?? null,
        eventTitle,
        eventStart,
        eventEnd,
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

    const booking = await Booking.findOne({ ticketId: sanitizedTicketId })
        .populate({
            path: 'selectedSessions',
            select: 'title speakers day startTime endTime price event',
            populate: {
                path: 'event',
                select: 'title startDate endDate',
            },
        })
        .lean();

    if (!booking) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket not found.');
    }

    if (!booking.qrCode || !booking.pdfUrl) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Ticket has not been generated yet.');
    }

    return {
        ticketId: booking.ticketId,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        ticketCount: booking.ticketCount,
        totalAmount: booking.totalAmount,
        bookingStatus: booking.bookingStatus,
        pdfUrl: booking.pdfUrl,
        ticketGeneratedAt: booking.ticketGeneratedAt,
        checkedInAt: booking.checkedInAt,
        selectedSessions: booking.selectedSessions,
    };
};
