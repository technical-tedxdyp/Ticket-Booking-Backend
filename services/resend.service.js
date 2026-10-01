import { Resend } from 'resend';
import nodemailer from 'nodemailer';

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
    const emailProvider = (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
    const attachments = [];

    if (pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
        attachments.push({
            filename: `TEDx_Ticket_${ticketId || 'Booking'}.pdf`,
            content: pdfBuffer,
        });
    }

    const formattedAmount = totalAmount ? `₹${totalAmount}` : 'N/A';
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
                    <tr>
                        <td class="email-pad" align="center" style="padding:16px 36px 28px;font-size:13px;line-height:20px;color:#536174;">Your ticket PDF is attached below. Download the attached file and keep it ready to show at the entry gate.</td>
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

    const message = {
        from: process.env.EMAIL_FROM || 'TEDx Events <tickets@resend.dev>',
        subject: `🎉 Ticket Confirmed - ${eventDetails.eventName}`,
        html: htmlContent,
        attachments,
    };

    if (emailProvider === 'resend') {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('EMAIL_PROVIDER is "resend", but RESEND_API_KEY is not configured. Set EMAIL_PROVIDER=mailtrap to use Mailtrap SMTP.');
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({ ...message, to: [email] });
        if (error) throw new Error(error.message);
        return data;
    }

    if (emailProvider === 'mailtrap') {
        if (process.env.MAILTRAP_API_TOKEN) {
            const fromMatch = (process.env.EMAIL_FROM || '').match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
            const fromEmail = fromMatch ? fromMatch[2].trim() : (process.env.EMAIL_FROM || '').trim();
            const fromName = fromMatch?.[1]?.trim();
            const apiAttachments = attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content.toString('base64'),
                type: 'application/pdf',
                disposition: 'attachment',
            }));

            if (!fromEmail) throw new Error('EMAIL_FROM must contain a verified Mailtrap sender address.');

            const response = await fetch('https://send.api.mailtrap.io/api/send', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.MAILTRAP_API_TOKEN}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'tedx-ticket-booking-backend',
                },
                body: JSON.stringify({
                    from: { email: fromEmail, ...(fromName ? { name: fromName } : {}) },
                    to: [{ email }],
                    subject: message.subject,
                    html: message.html,
                    attachments: apiAttachments,
                }),
                signal: AbortSignal.timeout(20000),
            });

            if (!response.ok) {
                const responseText = await response.text();
                throw new Error(`Mailtrap API rejected the email (HTTP ${response.status}): ${responseText.slice(0, 500)}`);
            }

            return response.json();
        }

        if (!process.env.MAILTRAP_USER || !process.env.MAILTRAP_PASSWORD) {
            throw new Error('Set MAILTRAP_API_TOKEN for HTTPS delivery, or configure both MAILTRAP_USER and MAILTRAP_PASSWORD for SMTP.');
        }

        const mailtrapPort = Number(process.env.MAILTRAP_PORT || 587);
        const mailtrapTransport = nodemailer.createTransport({
            host: process.env.MAILTRAP_HOST || 'live.smtp.mailtrap.io',
            port: mailtrapPort,
            secure: mailtrapPort === 465,
            auth: {
                user: process.env.MAILTRAP_USER,
                pass: process.env.MAILTRAP_PASSWORD,
            },
        });
        return mailtrapTransport.sendMail({ ...message, to: email });
    }

    throw new Error(`Unsupported EMAIL_PROVIDER: ${emailProvider}`);
};
