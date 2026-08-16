import PDFDocument from 'pdfkit';
import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

// Brand colours
const RED = '#E62B1E';
const DARK = '#1A1A1A';
const GREY = '#555555';
const LIGHT_GREY = '#888888';
const WHITE = '#FFFFFF';
const DIVIDER = '#DDDDDD';

const formatDate = (date) => {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatTime = (date) => {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};


export const generateTicketPDF = async (ticketData, qrCodeBuffer) => {
    if (!ticketData || typeof ticketData !== 'object') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'ticketData is required to generate a PDF.');
    }

    if (!ticketData.ticketId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'ticketData.ticketId is required to generate a PDF.');
    }

    if (!qrCodeBuffer || !Buffer.isBuffer(qrCodeBuffer) || qrCodeBuffer.length === 0) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'A valid QR code Buffer is required to generate a PDF.');
    }

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
                info: {
                    Title: `TEDx Ticket — ${ticketData.ticketId}`,
                    Author: 'TEDx DYP',
                    Subject: 'Event Ticket',
                },
            });

            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const pageW = doc.page.width;
            const pageH = doc.page.height;
            const margin = 50;
            const contentW = pageW - margin * 2;

            // ── Header band ──────────────────────────────────────────────────
            doc.rect(0, 0, pageW, 110).fill(RED);

            // TEDx wordmark
            doc
                .fillColor(WHITE)
                .fontSize(38)
                .font('Helvetica-Bold')
                .text('TED', margin, 28, { continued: true })
                .fillColor(WHITE)
                .font('Helvetica')
                .fontSize(22)
                .text('x', { baseline: 'alphabetic', continued: true })
                .fillColor(WHITE)
                .font('Helvetica-Bold')
                .fontSize(38)
                .text(' DYP', { continued: false });

            doc
                .fillColor(WHITE)
                .font('Helvetica')
                .fontSize(10)
                .text('Ideas Worth Spreading', margin, 74);

            // "TICKET" badge on the right
            const badgeX = pageW - margin - 90;
            doc.roundedRect(badgeX, 30, 90, 52, 6).fillAndStroke('rgba(0,0,0,0.25)', 'rgba(0,0,0,0)');
            doc
                .fillColor(WHITE)
                .font('Helvetica-Bold')
                .fontSize(11)
                .text('ADMISSION', badgeX, 42, { width: 90, align: 'center' })
                .text('TICKET', badgeX, 57, { width: 90, align: 'center' });

            let y = 130;

            // ── Event title ──────────────────────────────────────────────────
            if (ticketData.eventTitle) {
                doc.fillColor(RED).font('Helvetica-Bold').fontSize(16).text(ticketData.eventTitle, margin, y, { width: contentW, align: 'center' });
                y += 24;
            }

            if (ticketData.eventStart) {
                const dateStr = formatDate(ticketData.eventStart);
                const endDateStr = ticketData.eventEnd ? formatDate(ticketData.eventEnd) : null;
                const dateLabel = endDateStr && endDateStr !== dateStr
                    ? `${dateStr} – ${endDateStr}`
                    : dateStr;
                doc.fillColor(GREY).font('Helvetica').fontSize(10).text(dateLabel, margin, y, { width: contentW, align: 'center' });
                y += 16;
            }

            y += 10;
            doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(DIVIDER).lineWidth(1).stroke();
            y += 18;

            // ── Attendee section ─────────────────────────────────────────────
            const drawLabel = (label, value, curY, labelX = margin, valueX = margin + 110) => {
                doc.fillColor(LIGHT_GREY).font('Helvetica').fontSize(9).text(label.toUpperCase(), labelX, curY);
                doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text(value || '—', valueX, curY - 1);
                return curY + 20;
            };

            doc.fillColor(RED).font('Helvetica-Bold').fontSize(9).text('ATTENDEE', margin, y);
            y += 14;

            y = drawLabel('Name', ticketData.name || '—', y);
            if (ticketData.email) {
                y = drawLabel('Email', ticketData.email, y);
            }
            if (ticketData.ticketCount) {
                y = drawLabel('Tickets', String(ticketData.ticketCount), y);
            }

            y += 6;
            doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(DIVIDER).lineWidth(1).stroke();
            y += 18;

            // ── Ticket ID ────────────────────────────────────────────────────
            doc.fillColor(RED).font('Helvetica-Bold').fontSize(9).text('TICKET ID', margin, y);
            y += 12;

            // Styled ticket-id box
            doc.roundedRect(margin, y, contentW, 34, 5).fillAndStroke('#FFF5F5', RED);
            doc
                .fillColor(RED)
                .font('Helvetica-Bold')
                .fontSize(16)
                .text(ticketData.ticketId, margin, y + 9, { width: contentW, align: 'center' });
            y += 50;

            doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(DIVIDER).lineWidth(1).stroke();
            y += 18;

            // ── Sessions section ─────────────────────────────────────────────
            const sessions = ticketData.sessions;
            if (sessions && sessions.length > 0) {
                doc.fillColor(RED).font('Helvetica-Bold').fontSize(9).text('SESSIONS', margin, y);
                y += 12;

                for (const session of sessions) {
                    const title = session.title || 'Session';
                    const speakers = Array.isArray(session.speakers) && session.speakers.length
                        ? session.speakers.join(', ')
                        : null;
                    const dayLabel = session.day ? `Day ${session.day}` : null;
                    const timeLabel = session.startTime && session.endTime
                        ? `${formatTime(session.startTime)} – ${formatTime(session.endTime)}`
                        : null;

                    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(title, margin, y);
                    y += 14;

                    const meta = [dayLabel, timeLabel].filter(Boolean).join('  ·  ');
                    if (meta) {
                        doc.fillColor(GREY).font('Helvetica').fontSize(9).text(meta, margin, y);
                        y += 12;
                    }
                    if (speakers) {
                        doc.fillColor(LIGHT_GREY).font('Helvetica').fontSize(9).text(`Speaker(s): ${speakers}`, margin, y);
                        y += 12;
                    }

                    y += 6;
                }

                y += 4;
                doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(DIVIDER).lineWidth(1).stroke();
                y += 18;
            }

            // ── QR Code ──────────────────────────────────────────────────────
            const qrSize = 150;
            const qrX = (pageW - qrSize) / 2;

            doc.fillColor(RED).font('Helvetica-Bold').fontSize(9).text('SCAN TO VERIFY', margin, y, { width: contentW, align: 'center' });
            y += 14;

            // White card behind QR
            doc.roundedRect(qrX - 10, y - 10, qrSize + 20, qrSize + 20, 8).fill(WHITE);

            doc.image(qrCodeBuffer, qrX, y, { width: qrSize, height: qrSize });
            y += qrSize + 20;

            // Footer
            doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(DIVIDER).lineWidth(1).stroke();
            y += 14;

            doc
                .fillColor(LIGHT_GREY)
                .font('Helvetica')
                .fontSize(8)
                .text('Please present this ticket (printed or digital) at the event entrance for scanning.', margin, y, { width: contentW, align: 'center' });
            y += 12;

            // Bottom accent strip
            doc.rect(0, pageH - 8, pageW, 8).fill(RED);

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

