import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const EVENT_DETAILS = {
    eventName: 'TEDxDYPatilUniversity 2026',
    theme: 'Ideas Worth Spreading: Beyond Horizons',
    date: 'Saturday, October 24, 2026',
    time: '09:00 AM - 05:00 PM IST',
    venue: 'DY Patil University Auditorium, Sector 7, Nerul, Navi Mumbai, Maharashtra 400706',
    contactEmail: 'support@tedxdypatil.com',
};

export const sendTicketEmail = async ({
    email,
    name,
    ticketId,
    ticketCount,
    totalAmount,
    pdfUrl,
    pdfBuffer,
    eventDetails = EVENT_DETAILS,
}) => {
    const attachments = [];

    if (pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
        attachments.push({
            filename: `TEDx_Ticket_${ticketId || 'Booking'}.pdf`,
            content: pdfBuffer,
        });
    }

    const formattedAmount = totalAmount ? `₹${totalAmount}` : 'N/A';

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your TEDx Ticket and Welcome</title>
        <style>
            body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #0f0f11;
                color: #e0e0e0;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }
            .wrapper {
                width: 100%;
                background-color: #0f0f11;
                padding: 40px 10px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #18181c;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                border: 1px solid #2a2a30;
            }
            .header {
                background: linear-gradient(135deg, #eb0028 0%, #a6001c 100%);
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                color: #ffffff;
                font-size: 28px;
                font-weight: 800;
                letter-spacing: -0.5px;
            }
            .header p {
                margin: 5px 0 0 0;
                color: rgba(255,255,255,0.85);
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .content {
                padding: 30px;
            }
            .greeting {
                font-size: 20px;
                font-weight: 600;
                color: #ffffff;
                margin-bottom: 15px;
            }
            .message {
                font-size: 15px;
                line-height: 1.6;
                color: #b0b0b8;
                margin-bottom: 25px;
            }
            .section-card {
                background-color: #222228;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                border-left: 4px solid #eb0028;
            }
            .section-title {
                font-size: 14px;
                font-weight: 700;
                color: #eb0028;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 12px;
            }
            .info-grid {
                display: table;
                width: 100%;
            }
            .info-row {
                display: table-row;
            }
            .info-label {
                display: table-cell;
                padding: 6px 0;
                font-size: 13px;
                color: #888894;
                width: 35%;
            }
            .info-value {
                display: table-cell;
                padding: 6px 0;
                font-size: 14px;
                color: #ffffff;
                font-weight: 600;
            }
            .badge {
                display: inline-block;
                background-color: #eb0028;
                color: #ffffff;
                font-size: 12px;
                font-weight: 700;
                padding: 4px 10px;
                border-radius: 4px;
                letter-spacing: 0.5px;
            }
            .btn-container {
                text-align: center;
                margin: 30px 0 15px 0;
            }
            .btn {
                display: inline-block;
                background-color: #eb0028;
                color: #ffffff !important;
                text-decoration: none;
                font-weight: 700;
                font-size: 15px;
                padding: 14px 32px;
                border-radius: 6px;
                box-shadow: 0 4px 15px rgba(235, 0, 40, 0.4);
            }
            .attachment-note {
                font-size: 12px;
                color: #777782;
                text-align: center;
                margin-top: 10px;
            }
            .footer {
                background-color: #121215;
                padding: 20px 30px;
                text-align: center;
                font-size: 12px;
                color: #666670;
                border-top: 1px solid #222228;
            }
            .footer p {
                margin: 4px 0;
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <h1>TEDx DYP Akurdi</span></h1>
                    <p>${eventDetails.theme}</p>
                </div>

                <!-- Content -->
                <div class="content">
                    <div class="greeting">Hi ${name},</div>
                    <div class="message">
                        Congratulations! Your booking for <strong>${eventDetails.eventName}</strong> has been confirmed. Get ready for a day packed with inspirational talks, breakthrough ideas, and transformative networking.
                    </div>

                    <!-- Booking Info -->
                    <div class="section-card">
                        <div class="section-title">🎟️ Booking Information</div>
                        <div class="info-grid">
                            ${ticketId ? `
                            <div class="info-row">
                                <div class="info-label">Ticket ID:</div>
                                <div class="info-value"><span class="badge">${ticketId}</span></div>
                            </div>
                            ` : ''}
                            <div class="info-row">
                                <div class="info-label">Attendee Name:</div>
                                <div class="info-value">${name}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Ticket Quantity:</div>
                                <div class="info-value">${ticketCount || 1} Ticket(s)</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Total Paid:</div>
                                <div class="info-value">${formattedAmount}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Event Info -->
                    <div class="section-card">
                        <div class="section-title">📍 Event Details</div>
                        <div class="info-grid">
                            <div class="info-row">
                                <div class="info-label">Event:</div>
                                <div class="info-value">${eventDetails.eventName}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Date:</div>
                                <div class="info-value">${eventDetails.date}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Time:</div>
                                <div class="info-value">${eventDetails.time}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Venue:</div>
                                <div class="info-value">${eventDetails.venue}</div>
                            </div>
                        </div>
                    </div>

                    ${pdfUrl ? `
                    <div class="btn-container">
                        <a href="${pdfUrl}" class="btn" target="_blank">Download PDF Ticket</a>
                    </div>
                    ` : ''}

                    <div class="attachment-note">
                        📎 Your PDF Ticket is also attached to this email. Please bring a digital or printed copy to the entry gate.
                    </div>
                </div>

                <!-- Footer -->
                <div class="footer">
                    <p>This event is independently organized under license from TED.</p>
                    <p>For support or inquiries, contact us at ${eventDetails.contactEmail}</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

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

