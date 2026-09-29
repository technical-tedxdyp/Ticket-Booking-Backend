import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { generateTicketId } from '../utils/generateTicketId.js';
import { generateQRCode } from './qr.service.js';
import { generateTicketPDF } from './pdf.service.js';
import Booking from '../models/booking.model.js';
import mongoose from 'mongoose';
import Session from '../models/session.model.js';

const getBookingSessions = async (selectedSessions = []) => {
    const sessionIds = selectedSessions.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const foundSessions = await Session.find({ _id: { $in: sessionIds } })
        .populate('event')
        .lean();
    const sessionsById = new Map(foundSessions.map((session) => [session._id.toString(), session]));
    return sessionIds.map((id) => sessionsById.get(id)).filter(Boolean);
};

const buildTicketData = async (booking, ticketId) => {
    const sessionDocs = await getBookingSessions(booking.selectedSessions);
    const event = sessionDocs.find((session) => session.event && typeof session.event === 'object')?.event;

    return {
        ticketId,
        name: booking.name,
        email: booking.email ?? null,
        ticketCount: booking.ticketCount ?? null,
        totalAmount: booking.totalAmount ?? null,
        eventTitle: event?.title ?? null,
        eventStart: event?.startDate ?? null,
        eventEnd: event?.endDate ?? null,
        sessions: sessionDocs.map((session) => ({
            title: session.title,
            speakers: session.speakers || [],
            day: session.day,
            startTime: session.startTime,
            endTime: session.endTime,
        })),
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
            ticketData: await buildTicketData(booking, booking.ticketId),
            alreadyGenerated: true,
        };
    }

    const ticketId = generateTicketId();

    const qrCodeBuffer = await generateQRCode(ticketId);

    const ticketData = await buildTicketData(booking, ticketId);

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

    const sessions = await getBookingSessions(booking.selectedSessions);

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
