import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const EVENT_DETAILS = {
    eventName: 'TEDxDYP Akurdi 2026',
    theme: 'Meandering in the mosaic',
    date: 'Tuesday, October 6, 2026',
    time: '10:00 AM - 06:00 PM IST',
    venue: 'DY Patil International University Campus, Akurdi, Pune, Maharashtra, India',
    contactEmail: 'technical.tedxdyp@gmail.com',
};

const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (character) => {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };

        return entities[character];
    });

export const sendTicketEmail = async ({ email, name, ticketId, ticketCount, totalAmount, pdfUrl, pdfBuffer, eventDetails = EVENT_DETAILS }) => {
    if (!resend) {
        throw new Error('RESEND_API_KEY is not configured. Email delivery is disabled.');
    }

    const attachments = [];

    if (pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
        attachments.push({
            filename: `TEDx_Ticket_${ticketId || 'Booking'}.pdf`,
            content: pdfBuffer,
        });
    }

    const formattedAmount = totalAmount ? `₹${totalAmount}` : 'N/A';
    const ticketDownloadUrl =
        ticketId && process.env.PUBLIC_API_URL
            ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/ticket/${encodeURIComponent(ticketId)}/pdf`
            : pdfUrl;
    const safe = {
        name: escapeHtml(name),
        ticketId: escapeHtml(ticketId),
        ticketCount: escapeHtml(ticketCount || 1),
        formattedAmount: escapeHtml(formattedAmount),
        eventName: escapeHtml(eventDetails.eventName),
        theme: escapeHtml(eventDetails.theme),
        date: escapeHtml(eventDetails.date),
        venue: escapeHtml(eventDetails.venue),
        contactEmail: escapeHtml(eventDetails.contactEmail),
        pdfUrl: escapeHtml(ticketDownloadUrl),
    };

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Your TEDx ticket is confirmed</title>
    <style>
        body { margin: 0; padding: 0; background: #eef1f5; }
        table { border-collapse: collapse; }
        @media only screen and (max-width: 620px) {
            .email-shell { width: 100% !important; }
            .email-pad { padding-left: 22px !important; padding-right: 22px !important; }
            .event-value { width: 58% !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#eef1f5;font-family:Arial,Helvetica,sans-serif;color:#162235;-webkit-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef1f5;">
        <tr>
            <td align="center" style="padding:30px 12px;">
                <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dce1e8;">
                    <tr>
                        <td style="height:5px;background-color:#e62b1e;font-size:0;line-height:0;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td class="email-pad" style="padding:28px 36px 30px;background-color:#101318;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="font-size:25px;line-height:30px;font-weight:800;color:#ffffff;">
                                        <span style="color:#e62b1e;">TEDx</span> DYP Akurdi
                                    </td>
                                    <td align="right" style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.5px;color:#aab2bf;">TICKET CONFIRMED</td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="padding-top:12px;font-size:13px;line-height:20px;color:#c3cad4;">${safe.theme}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td class="email-pad" style="padding:30px 36px 12px;">
                            <div style="font-size:23px;line-height:29px;font-weight:700;color:#162235;">Your place is confirmed, ${safe.name}.</div>
                            <div style="padding-top:9px;font-size:14px;line-height:22px;color:#536174;">Your booking for <strong style="color:#162235;">${safe.eventName}</strong> is confirmed. Keep your ticket ready for entry.</div>
                        </td>
                    </tr>
                    <tr>
                        <td class="email-pad" style="padding:16px 36px 10px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dce1e8;background-color:#ffffff;">
                                <tr>
                                    <td style="width:4px;background-color:#e62b1e;font-size:0;line-height:0;">&nbsp;</td>
                                    <td style="padding:20px 22px 18px;">
                                        <div style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.8px;color:#7a8798;">OFFICIAL ENTRY PASS</div>
                                        ${ticketId ? `<div style="padding-top:7px;font-family:'Courier New',monospace;font-size:19px;line-height:25px;font-weight:700;color:#e62b1e;">${safe.ticketId}</div>` : ''}
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:17px;border-top:1px solid #e6eaf0;">
                                            <tr>
                                                <td style="width:50%;padding:14px 12px 4px 0;vertical-align:top;">
                                                    <div style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:1px;color:#7a8798;">ATTENDEE</div>
                                                    <div style="padding-top:5px;font-size:14px;line-height:20px;font-weight:700;color:#162235;">${safe.name}</div>
                                                </td>
                                                <td style="width:50%;padding:14px 0 4px 12px;vertical-align:top;">
                                                    <div style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:1px;color:#7a8798;">TICKETS</div>
                                                    <div style="padding-top:5px;font-size:14px;line-height:20px;font-weight:700;color:#162235;">${safe.ticketCount}</div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td colspan="2" style="padding-top:12px;">
                                                    <div style="height:1px;background-color:#e6eaf0;font-size:0;line-height:0;">&nbsp;</div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td colspan="2" style="padding-top:12px;">
                                                    <div style="font-size:10px;line-height:14px;font-weight:700;letter-spacing:1px;color:#7a8798;">TOTAL PAID</div>
                                                    <div style="padding-top:5px;font-size:16px;line-height:22px;font-weight:700;color:#162235;">${safe.formattedAmount}</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td class="email-pad" style="padding:18px 36px 24px;">
                            <div style="padding-bottom:11px;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.8px;color:#e62b1e;">EVENT DETAILS</div>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #dce1e8;">
                                <tr>
                                    <td style="width:34%;padding:10px 12px 10px 0;border-bottom:1px solid #e6eaf0;font-size:12px;line-height:18px;color:#7a8798;vertical-align:top;">Event</td>
                                    <td class="event-value" style="width:66%;padding:10px 0;border-bottom:1px solid #e6eaf0;font-size:13px;line-height:19px;font-weight:700;color:#162235;vertical-align:top;">${safe.eventName}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 12px 10px 0;border-bottom:1px solid #e6eaf0;font-size:12px;line-height:18px;color:#7a8798;vertical-align:top;">Date</td>
                                    <td class="event-value" style="padding:10px 0;border-bottom:1px solid #e6eaf0;font-size:13px;line-height:19px;font-weight:700;color:#162235;vertical-align:top;">${safe.date}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 12px 0 0;font-size:12px;line-height:18px;color:#7a8798;vertical-align:top;">Venue</td>
                                    <td class="event-value" style="padding:10px 0 0;font-size:13px;line-height:19px;font-weight:700;color:#162235;vertical-align:top;">${safe.venue}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    ${ticketDownloadUrl ? `<tr><td align="center" class="email-pad" style="padding:8px 36px 8px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#e62b1e" style="background-color:#e62b1e;"><a href="${safe.pdfUrl}" target="_blank" style="display:inline-block;padding:15px 28px;font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.8px;color:#ffffff;text-decoration:none;">DOWNLOAD YOUR TICKET</a></td></tr></table></td></tr>` : ''}
                    <tr>
                        <td class="email-pad" align="center" style="padding:12px 36px 28px;font-size:12px;line-height:19px;color:#7a8798;">Your PDF is attached to this email too. Please bring a digital or printed copy to the entry gate.</td>
                    </tr>
                    <tr>
                        <td class="email-pad" style="padding:20px 36px;background-color:#101318;border-top:3px solid #e62b1e;">
                            <div style="font-size:11px;line-height:18px;color:#c3cad4;">This event is independently organized under license from TED.</div>
                            <div style="padding-top:4px;font-size:11px;line-height:18px;color:#aab2bf;">Questions? <a href="mailto:${safe.contactEmail}" style="color:#ffffff;text-decoration:underline;">${safe.contactEmail}</a></div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'TEDx Events <tickets@resend.dev>',
        to: [email],
        subject: `🎉 Ticket Confirmed - ${eventDetails.eventName}`,
        html: htmlContent,
        attachments,
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
};
