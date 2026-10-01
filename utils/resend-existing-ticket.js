import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import connectDB from '../config/db.js';
import Booking from '../models/booking.model.js';
import { BOOKING_STATUS } from './constants.js';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const emailSchema = z.string().trim().toLowerCase().email();

const getCloudinaryPublicId = (url) => {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error('The booking does not contain a valid Cloudinary PDF URL.');
    }

    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'res.cloudinary.com') {
        throw new Error('The stored PDF URL is not a trusted Cloudinary HTTPS URL.');
    }

    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    const uploadIndex = parts.findIndex((part, index) => parts[index - 1] === 'raw' && part === 'upload');
    if (uploadIndex < 0) throw new Error('The stored URL is not a raw Cloudinary upload URL.');

    const assetParts = parts.slice(uploadIndex + 1);
    if (/^v\d+$/.test(assetParts[0] || '')) assetParts.shift();
    if (assetParts.length === 0) throw new Error('Could not determine the Cloudinary asset ID.');

    return decodeURIComponent(assetParts.join('/'));
};

const readPdf = async (response) => {
    if (!response.ok || !response.body) {
        throw new Error(`Could not download the existing PDF (HTTP ${response.status}).`);
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_BYTES) {
        throw new Error('The existing PDF is unexpectedly large; refusing to send it.');
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_PDF_BYTES) {
            await reader.cancel();
            throw new Error('The existing PDF is unexpectedly large; refusing to send it.');
        }
        chunks.push(Buffer.from(value));
    }

    const pdf = Buffer.concat(chunks);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error('Cloudinary did not return a valid PDF.');
    }
    return pdf;
};

const downloadExistingPdf = async (storedUrl) => {
    const requestOptions = { redirect: 'error', signal: AbortSignal.timeout(15000) };
    const originalResponse = await fetch(storedUrl, requestOptions);
    if (originalResponse.status !== 401 && originalResponse.status !== 403) {
        return readPdf(originalResponse);
    }
    await originalResponse.body?.cancel();

    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
            'Cloudinary denied public access. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET locally to use signed download.',
        );
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    const publicId = getCloudinaryPublicId(storedUrl);
    const asset = await cloudinary.api.resource(publicId, { resource_type: 'raw', type: 'upload' });
    const signedUrl = cloudinary.utils.private_download_url(asset.public_id, asset.format || 'pdf', {
        resource_type: 'raw',
        type: asset.type || 'upload',
        expires_at: Math.floor(Date.now() / 1000) + 300,
        attachment: true,
    });

    return readPdf(await fetch(signedUrl, requestOptions));
};

const run = async () => {
    const [bookingId, rawEmail] = process.argv.slice(2);
    if (!mongoose.Types.ObjectId.isValid(bookingId || '')) {
        throw new Error('Usage: npm run resend-existing-ticket -- <bookingId> <correct-email>');
    }

    const parsedEmail = emailSchema.safeParse(rawEmail || '');
    if (!parsedEmail.success) throw new Error('Provide a valid corrected email address.');
    const correctedEmail = parsedEmail.data;

    await connectDB();
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new Error('Booking not found.');
    if (![BOOKING_STATUS.TICKET_GENERATED, BOOKING_STATUS.CHECKED_IN].includes(booking.bookingStatus)) {
        throw new Error(`Booking status is ${booking.bookingStatus}; only paid bookings with generated tickets can be resent.`);
    }
    if (!booking.ticketId || !booking.pdfUrl) {
        throw new Error('Booking is missing its existing ticket ID or Cloudinary PDF URL. No ticket will be generated.');
    }

    const pdfBuffer = await downloadExistingPdf(booking.pdfUrl);
    const rl = readline.createInterface({ input, output });
    let confirmed = false;
    try {
        console.log(`Booking: ${booking._id}`);
        console.log(`Ticket: ${booking.ticketId}`);
        console.log(`Current email: ${booking.email}`);
        console.log(`New recipient: ${correctedEmail}`);
        console.log('The existing Cloudinary PDF will be attached; no ticket will be regenerated.');
        confirmed = (await rl.question(`Type ${booking.ticketId} to send and update the booking email: `)).trim() === booking.ticketId;
    } finally {
        rl.close();
    }

    if (!confirmed) {
        console.log('Confirmation did not match. No email was sent and no booking was changed.');
        return;
    }

    const { sendTicketEmail } = await import('../services/resend.service.js');
    await sendTicketEmail({
        email: correctedEmail,
        name: booking.name,
        ticketId: booking.ticketId,
        ticketCount: booking.ticketCount,
        totalAmount: booking.totalAmount,
        pdfUrl: booking.pdfUrl,
        pdfBuffer,
    });

    const updatedBooking = await Booking.findOneAndUpdate(
        {
            _id: booking._id,
            bookingStatus: booking.bookingStatus,
            ticketId: booking.ticketId,
            pdfUrl: booking.pdfUrl,
            email: booking.email,
        },
        { $set: { email: correctedEmail } },
        { new: true, runValidators: true },
    );
    if (!updatedBooking) {
        throw new Error(
            'Email was sent, but the booking changed before its email could be updated. Check the booking before retrying to avoid sending a duplicate.',
        );
    }

    console.log(`Existing ticket ${booking.ticketId} sent to ${correctedEmail}; booking email updated.`);
};

run()
    .catch((error) => {
        console.error(`Ticket resend failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close();
    });
