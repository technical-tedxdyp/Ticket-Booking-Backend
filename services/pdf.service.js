import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import ApiError from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { generateQRCode } from './qr.service.js';

// -----------------------------------------------------------------------------
// PATHS
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const LOGO_PATH = path.join(PUBLIC_DIR, 'tedx-logo.png');
const FONT_DIR = path.join(PUBLIC_DIR, 'fonts');

// -----------------------------------------------------------------------------
// FONTS
// -----------------------------------------------------------------------------

const fonts = {
    regular: path.join(FONT_DIR, 'SpaceGrotesk-Regular.ttf'),
    medium: path.join(FONT_DIR, 'SpaceGrotesk-Medium.ttf'),
    semibold: path.join(FONT_DIR, 'SpaceGrotesk-SemiBold.ttf'),
    bold: path.join(FONT_DIR, 'SpaceGrotesk-Bold.ttf'),
    mono: path.join(FONT_DIR, 'VT323-Regular.ttf')
};

// -----------------------------------------------------------------------------
// COLORS
// -----------------------------------------------------------------------------

const COLORS = {
    RED: '#E62B1E',
    BRIGHT_RED: '#F51D2A',

    DARK: '#101318',
    DARK_2: '#171A20',

    TEXT: '#162235',
    MUTED: '#536174',
    LIGHT_TEXT: '#7A8798',

    WHITE: '#FFFFFF',
    OFF_WHITE: '#F3F5F8',

    PANEL: '#F4F6F9',
    DIVIDER: '#DCE1E8',
    SHADOW: '#E2E6EC',

    BLACK: '#000000'
};

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function exists(filePath) {
    return fs.existsSync(filePath);
}

function safeString(value, fallback = '') {
    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value);
}

function getValue(object, keys, fallback = '') {
    for (const key of keys) {
        if (
            object &&
            object[key] !== undefined &&
            object[key] !== null &&
            String(object[key]).trim() !== ''
        ) {
            return String(object[key]);
        }
    }

    return fallback;
}

function drawDivider(doc, x1, y, x2, color = COLORS.DIVIDER) {
    doc
        .save()
        .moveTo(x1, y)
        .lineTo(x2, y)
        .lineWidth(0.7)
        .strokeColor(color)
        .stroke()
        .restore();
}

/**
 * Draws a single line of text that shrinks to fit the given width
 * (down to minSize) and falls back to an ellipsis if still too long.
 */
function drawFittedText(doc, text, x, y, options = {}) {
    const {
        font = fonts.medium,
        size = 10,
        minSize = 7,
        color = COLORS.TEXT,
        width,
        align = 'left',
        characterSpacing = 0,
        lineGap = 0
    } = options;

    const value = safeString(text);

    const lines = value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    // Single-line text
    if (lines.length <= 1) {
        const singleLine = lines[0] || '';
        let fontSize = size;

        doc.font(font).fontSize(fontSize);

        while (
            fontSize > minSize &&
            doc.widthOfString(singleLine) > width
        ) {
            fontSize -= 0.5;
            doc.fontSize(fontSize);
        }

        doc
            .fillColor(color)
            .text(singleLine, x, y, {
                width,
                height: fontSize * 1.3,
                align,
                ellipsis: true,
                characterSpacing
            });

        return;
    }

    // Multi-line text
    let fontSize = size;

    doc.font(font).fontSize(fontSize);

    // Find a size that allows the longest line to fit.
    const longestLine = lines.reduce(
        (longest, line) =>
            doc.widthOfString(line) >
                doc.widthOfString(longest)
                ? line
                : longest,
        ''
    );

    while (
        fontSize > minSize &&
        doc.widthOfString(longestLine) > width
    ) {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
    }

    doc
        .fillColor(color)
        .text(lines.join('\n'), x, y, {
            width,
            align,
            lineGap,
            characterSpacing
        });
}

// -----------------------------------------------------------------------------
// ICONS
// -----------------------------------------------------------------------------

function drawIcon(doc, type, cx, cy, size = 28) {
    const radius = size / 2;

    doc
        .save()
        .circle(cx, cy, radius)
        .fill(COLORS.RED)
        .restore();

    const s = size / 28;

    doc
        .save()
        .translate(cx, cy)
        .scale(s)
        .lineWidth(1.4)
        .lineCap('round')
        .lineJoin('round')
        .strokeColor(COLORS.WHITE)
        .fillColor(COLORS.WHITE);

    if (type === 'user') {
        doc
            .circle(0, -4, 4)
            .stroke();

        doc
            .moveTo(-7, 7)
            .bezierCurveTo(-6, 1, 6, 1, 7, 7)
            .stroke();

    } else if (type === 'phone') {
        doc
            .roundedRect(-4.5, -8, 9, 16, 2)
            .stroke();

        doc
            .moveTo(-1.5, 5)
            .lineTo(1.5, 5)
            .stroke();

    } else if (type === 'email') {
        doc
            .roundedRect(-9, -7, 18, 14, 2)
            .stroke();

        doc
            .moveTo(-8, -6)
            .lineTo(0, 1)
            .lineTo(8, -6)
            .stroke();

    } else if (type === 'ticket') {
        doc
            .roundedRect(-9, -6, 18, 12, 2)
            .stroke();

        doc
            .moveTo(-3, -4.5)
            .lineTo(-3, 4.5)
            .dash(1, { space: 2 })
            .stroke()
            .undash();

    } else if (type === 'calendar') {
        doc
            .roundedRect(-8, -7, 16, 15, 2)
            .stroke();

        doc
            .moveTo(-8, -2)
            .lineTo(8, -2)
            .stroke();

        doc
            .moveTo(-4, -10)
            .lineTo(-4, -5)
            .stroke();

        doc
            .moveTo(4, -10)
            .lineTo(4, -5)
            .stroke();

    } else if (type === 'clock') {
        doc
            .circle(0, 0, 8)
            .stroke();

        doc
            .moveTo(0, 0)
            .lineTo(0, -5)
            .stroke();

        doc
            .moveTo(0, 0)
            .lineTo(4, 2)
            .stroke();
    }

    doc.restore();
}

// -----------------------------------------------------------------------------
// HEADER
// -----------------------------------------------------------------------------

function drawHeader(doc, pageW) {
    const headerH = 112;
    const marginX = 30;

    // Dark background
    doc
        .save()
        .rect(0, 0, pageW, headerH)
        .fill(COLORS.DARK)
        .restore();

    // Subtle lighter band
    doc
        .save()
        .rect(0, headerH - 34, pageW, 34)
        .fillOpacity(0.35)
        .fill(COLORS.DARK_2)
        .restore();

    // Red accent stripes
    doc
        .save()
        .moveTo(pageW - 262, 0)
        .lineTo(pageW - 232, 0)
        .lineTo(pageW - 272, headerH)
        .lineTo(pageW - 302, headerH)
        .closePath()
        .fill(COLORS.BRIGHT_RED)
        .restore();

    doc
        .save()
        .moveTo(pageW - 222, 0)
        .lineTo(pageW - 210, 0)
        .lineTo(pageW - 250, headerH)
        .lineTo(pageW - 262, headerH)
        .closePath()
        .fillOpacity(0.55)
        .fill(COLORS.RED)
        .restore();

    // Heading
    doc
        .font(fonts.bold)
        .fontSize(29)
        .fillColor(COLORS.RED)
        .text('TEDx', marginX, 28, {
            continued: true,
            lineBreak: false
        })
        .fillColor(COLORS.WHITE)
        .text('DYPAkurdi', {
            lineBreak: false
        });

    // Tagline
    doc
        .font(fonts.medium)
        .fontSize(11)
        .fillColor(COLORS.LIGHT_TEXT)
        .text('Meandering into the ', marginX + 1, 71, {
            continued: true,
            lineBreak: false
        })
        .fillColor(COLORS.RED)
        .text('Mosaic', {
            lineBreak: false
        });

    // Short red rule
    doc
        .save()
        .rect(marginX + 1, 94, 46, 3)
        .fill(COLORS.RED)
        .restore();

    // Logo tile
    const tileW = 100;
    const tileH = 84;

    const tileX = pageW - marginX - tileW;
    const tileY = (headerH - tileH) / 2;

    doc
        .save()
        .roundedRect(
            tileX,
            tileY,
            tileW,
            tileH,
            10
        )
        .fill(COLORS.WHITE)
        .restore();

    if (exists(LOGO_PATH)) {
        doc.image(
            LOGO_PATH,
            tileX + 8,
            tileY + 8,
            {
                fit: [
                    tileW - 16,
                    tileH - 16
                ],
                align: 'center',
                valign: 'center'
            }
        );
    }

    // Red base line
    doc
        .save()
        .rect(0, headerH, pageW, 4)
        .fill(COLORS.RED)
        .restore();

    return headerH + 4;
}

// -----------------------------------------------------------------------------
// TITLE ROW
// -----------------------------------------------------------------------------

function drawTicketTitle(doc, pageW, y) {
    const marginX = 27;

    doc
        .save()
        .roundedRect(
            marginX,
            y,
            38,
            38,
            8
        )
        .fill(COLORS.RED)
        .restore();

    drawIcon(
        doc,
        'ticket',
        marginX + 19,
        y + 19,
        22
    );

    doc
        .font(fonts.bold)
        .fontSize(25)
        .fillColor(COLORS.TEXT)
        .text(
            'TICKET',
            marginX + 52,
            y + 5,
            {
                continued: true,
                lineBreak: false
            }
        )

    // Official entry pass
    const pillW = 170;
    const pillH = 24;

    const pillX =
        pageW - marginX - pillW;

    const pillY = y + 7;

    doc
        .save()
        .roundedRect(
            pillX,
            pillY,
            pillW,
            pillH,
            12
        )
        .lineWidth(0.8)
        .strokeColor(COLORS.RED)
        .stroke()
        .restore();

    doc
        .font(fonts.bold)
        .fontSize(7.5)
        .fillColor(COLORS.RED)
        .text(
            'OFFICIAL ENTRY PASS',
            pillX,
            pillY + 8,
            {
                width: pillW,
                align: 'center',
                characterSpacing: 1.6,
                lineBreak: false
            }
        );

    return 38;
}

// -----------------------------------------------------------------------------
// TICKET FIELD CELL
// -----------------------------------------------------------------------------

function drawField(
    doc,
    {
        x,
        y,
        width,
        icon,
        label,
        value,
        mono = false
    }
) {
    drawIcon(
        doc,
        icon,
        x + 15,
        y + 17,
        30
    );

    doc
        .font(fonts.bold)
        .fontSize(6.7)
        .fillColor(COLORS.LIGHT_TEXT)
        .text(
            label.toUpperCase(),
            x + 40,
            y + 2,
            {
                width: width - 40,
                characterSpacing: 1.2,
                lineBreak: false
            }
        );

    drawFittedText(
        doc,
        safeString(value, '—'),
        x + 40,
        y + 15,
        {
            font: mono
                ? fonts.mono
                : fonts.semibold,
            size: mono ? 15 : 11,
            minSize: 7.5,
            color: COLORS.TEXT,
            width: width - 40
        }
    );
}

// -----------------------------------------------------------------------------
// TICKET CARD
// -----------------------------------------------------------------------------

function drawQRCornerMarks(
    doc,
    x,
    y,
    size
) {
    const mark = 14;

    doc
        .save()
        .strokeColor(COLORS.RED)
        .lineWidth(3.5)
        .lineCap('square');

    // Top left
    doc
        .moveTo(x, y + mark)
        .lineTo(x, y)
        .lineTo(x + mark, y)
        .stroke();

    // Top right
    doc
        .moveTo(x + size - mark, y)
        .lineTo(x + size, y)
        .lineTo(x + size, y + mark)
        .stroke();

    // Bottom left
    doc
        .moveTo(x, y + size - mark)
        .lineTo(x, y + size)
        .lineTo(x + mark, y + size)
        .stroke();

    // Bottom right
    doc
        .moveTo(x + size - mark, y + size)
        .lineTo(x + size, y + size)
        .lineTo(x + size, y + size - mark)
        .stroke();

    doc.restore();
}

function drawTicketCard(
    doc,
    ticketData,
    qrCodeBuffer,
    pageW,
    x,
    y,
    width
) {
    const detailsH = 302;
    const qrSectionH = 226;
    const cardH = detailsH + qrSectionH;

    const pad = 22;
    const innerW = width - pad * 2;
    const gap = 16;

    const colW =
        (innerW - gap) / 2;

    // -------------------------------------------------------------------------
    // DATA
    // -------------------------------------------------------------------------

    const name = getValue(
        ticketData,
        [
            'name',
            'attendeeName',
            'fullName',
            'userName'
        ],
        'Guest'
    );

    const phone = getValue(
        ticketData,
        [
            'phone',
            'phoneNumber',
            'mobile',
            'mobileNumber'
        ],
        '—'
    );

    const email = getValue(
        ticketData,
        [
            'email',
            'emailAddress'
        ],
        '—'
    );

    const ticketId = getValue(
        ticketData,
        [
            'ticketId',
            'ticketID',
            'id'
        ],
        '—'
    );

    const session = getValue(
        ticketData,
        [
            'session',
            'sessionName',
            'talk',
            'talkName'
        ],
        'Fragment'
    );

    const sessionTiming = getValue(
        ticketData,
        [
            'sessionTiming',
            'sessionTimings',
            'timing',
            'time',
            'sessionTime'
        ],
        '10:00 am – 11:00 am'
    );

    // Date
    const sessionDate = getValue(
        ticketData,
        [
            'sessionDate',
            'date',
            'eventDate'
        ],
        ''
    );

    const sessionTimingWithDate =
        sessionDate
            ? `${sessionDate}\n${sessionTiming}`
            : sessionTiming;

    // -------------------------------------------------------------------------
    // CARD SHADOW
    // -------------------------------------------------------------------------

    doc
        .save()
        .roundedRect(
            x + 2,
            y + 4,
            width,
            cardH,
            16
        )
        .fill(COLORS.SHADOW)
        .restore();

    // -------------------------------------------------------------------------
    // CARD
    // -------------------------------------------------------------------------

    doc
        .save()
        .roundedRect(
            x,
            y,
            width,
            cardH,
            16
        )
        .lineWidth(0.8)
        .fillAndStroke(
            COLORS.WHITE,
            COLORS.DIVIDER
        )
        .restore();

    // Red accent tab
    doc
        .save()
        .rect(
            x + pad,
            y,
            64,
            4
        )
        .fill(COLORS.RED)
        .restore();

    // -------------------------------------------------------------------------
    // ATTENDEE
    // -------------------------------------------------------------------------

    const badgeW = 96;

    doc
        .font(fonts.bold)
        .fontSize(7)
        .fillColor(COLORS.LIGHT_TEXT)
        .text(
            'ATTENDEE',
            x + pad,
            y + 22,
            {
                characterSpacing: 2,
                lineBreak: false
            }
        );

    drawFittedText(
        doc,
        name,
        x + pad,
        y + 36,
        {
            font: fonts.bold,
            size: 26,
            minSize: 14,
            color: COLORS.TEXT,
            width: innerW - badgeW - 14
        }
    );

    drawDivider(
        doc,
        x + pad,
        y + 84,
        x + width - pad
    );

    // -------------------------------------------------------------------------
    // DETAIL GRID
    // -------------------------------------------------------------------------

    const col1 = x + pad;

    const col2 =
        x + pad + colW + gap;

    const row1 = y + 102;
    const row2 = y + 160;
    const row3 = y + 244;

    // Phone
    drawField(doc, {
        x: col1,
        y: row1,
        width: colW,
        icon: 'phone',
        label: 'Phone No.',
        value: phone
    });

    // Email
    drawField(doc, {
        x: col2,
        y: row1,
        width: colW,
        icon: 'email',
        label: 'Email',
        value: email
    });

    drawDivider(
        doc,
        x + pad,
        row2 - 11,
        x + width - pad,
        COLORS.OFF_WHITE
    );

    // Session
    drawField(doc, {
        x: col1,
        y: row2,
        width: colW,
        icon: 'calendar',
        label: 'Session',
        value: session
    });

    // Session timing + date
    drawField(doc, {
        x: col2,
        y: row2,
        width: colW,
        icon: 'clock',
        label: 'Session Date & Timings',
        value: sessionTimingWithDate
    });

    drawDivider(
        doc,
        x + pad,
        row3 - 11,
        x + width - pad,
        COLORS.OFF_WHITE
    );

    // Ticket ID
    drawField(doc, {
        x: col1,
        y: row3,
        width: innerW,
        icon: 'ticket',
        label: 'Ticket ID',
        value: ticketId,
        mono: true
    });

    // -------------------------------------------------------------------------
    // PERFORATION
    // -------------------------------------------------------------------------

    const perfY = y + detailsH;

    doc
        .save()
        .circle(
            x,
            perfY,
            11
        )
        .fill(COLORS.OFF_WHITE)
        .circle(
            x + width,
            perfY,
            11
        )
        .fill(COLORS.OFF_WHITE)
        .restore();

    doc
        .save()
        .moveTo(
            x + 20,
            perfY
        )
        .lineTo(
            x + width - 20,
            perfY
        )
        .lineWidth(1)
        .strokeColor('#B9C1CC')
        .dash(4, {
            space: 4
        })
        .stroke()
        .undash()
        .restore();

    // -------------------------------------------------------------------------
    // QR
    // -------------------------------------------------------------------------

    const qrSize = 130;

    const qrX =
        (pageW - qrSize) / 2;

    const qrY =
        perfY + 30;

    doc
        .save()
        .rect(
            qrX - 10,
            qrY - 10,
            qrSize + 20,
            qrSize + 20
        )
        .lineWidth(0.8)
        .fillAndStroke(
            COLORS.WHITE,
            COLORS.DIVIDER
        )
        .restore();

    // QR buffer is generated by generateQRCode()
    doc.image(
        qrCodeBuffer,
        qrX,
        qrY,
        {
            width: qrSize,
            height: qrSize
        }
    );

    drawQRCornerMarks(
        doc,
        qrX - 10,
        qrY - 10,
        qrSize + 20
    );

    // Existing text/design preserved
    doc
        .font(fonts.bold)
        .fontSize(8)
        .fillColor(COLORS.MUTED)
        .text(
            'SCAN AT ENTRY',
            0,
            qrY + qrSize + 22,
            {
                width: pageW,
                align: 'center',
                characterSpacing: 3,
                lineBreak: false
            }
        );

    drawFittedText(
        doc,
        ticketId,
        x + pad,
        qrY + qrSize + 37,
        {
            font: fonts.mono,
            size: 15,
            minSize: 9,
            color: COLORS.TEXT,
            width: innerW,
            align: 'center',
            characterSpacing: 1.5
        }
    );

    return cardH;
}

// -----------------------------------------------------------------------------
// NOTE PANEL
// -----------------------------------------------------------------------------

function drawNote(
    doc,
    x,
    y,
    width
) {
    const h = 30;

    doc
        .save()
        .roundedRect(
            x,
            y,
            width,
            h,
            10
        )
        .fill(COLORS.WHITE)
        .restore();

    doc
        .save()
        .roundedRect(
            x,
            y,
            4,
            h,
            2
        )
        .fill(COLORS.RED)
        .restore();

    // doc
    //     .font(fonts.bold)
    //     .fontSize(7.5)
    //     .fillColor(COLORS.RED)
    //     .text(
    //         'GOOD TO KNOW',
    //         x + 18,
    //         y + 10,
    //         {
    //             characterSpacing: 1.6,
    //             lineBreak: false
    //         }
    //     );

    doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(COLORS.MUTED)
        .text(
            'Please show this ticket at the entry gate. Each QR code is valid for a single entry.',
            x + 18,
            y + 10,
            {
                width: width - 34,
                height: 22
            }
        );

    return h;
}

// -----------------------------------------------------------------------------
// FOOTER
// -----------------------------------------------------------------------------

function drawFooter(
    doc,
    pageW,
    pageH
) {
    const footerH = 60;
    const footerY = pageH - footerH;

    // Dark base
    doc
        .save()
        .rect(
            0,
            footerY,
            pageW,
            footerH
        )
        .fill(COLORS.DARK)
        .restore();

    // Red top line
    doc
        .save()
        .rect(
            0,
            footerY,
            pageW,
            3
        )
        .fill(COLORS.RED)
        .restore();

    // Slanted red corner
    doc
        .save()
        .moveTo(
            pageW - 46,
            footerY + 3
        )
        .lineTo(
            pageW,
            footerY + 3
        )
        .lineTo(
            pageW,
            pageH
        )
        .lineTo(
            pageW - 26,
            pageH
        )
        .closePath()
        .fill(COLORS.RED)
        .restore();

    const centerY =
        footerY + 31;

    // -------------------------------------------------------------------------
    // WEBSITE
    // -------------------------------------------------------------------------

    const websiteUrl =
        'https://www.tedxdypakurdi.in/';

    const websiteX = 42;

    doc
        .save()
        .lineWidth(1.2)
        .strokeColor(COLORS.WHITE)
        .circle(
            websiteX,
            centerY,
            10
        )
        .stroke()
        .ellipse(
            websiteX,
            centerY,
            4.5,
            10
        )
        .stroke()
        .moveTo(
            websiteX - 10,
            centerY
        )
        .lineTo(
            websiteX + 10,
            centerY
        )
        .stroke()
        .restore();

    const websiteTextX = 60;
    const websiteTextY = centerY - 5;
    const websiteTextW = 130;

    doc
        .font(fonts.bold)
        .fontSize(8)
        .fillColor(COLORS.WHITE)
        .text(
            'www.tedxdypakurdi.in',
            websiteTextX,
            websiteTextY,
            {
                width: websiteTextW,
                lineBreak: false
            }
        );

    doc.link(
        websiteX - 12,
        centerY - 14,
        websiteTextW + 30,
        28,
        websiteUrl
    );

    // -------------------------------------------------------------------------
    // DIVIDER
    // -------------------------------------------------------------------------

    doc
        .save()
        .moveTo(
            pageW / 2,
            footerY + 15
        )
        .lineTo(
            pageW / 2,
            footerY + 47
        )
        .lineWidth(0.7)
        .strokeColor('#69717D')
        .stroke()
        .restore();

    // -------------------------------------------------------------------------
    // INSTAGRAM
    // -------------------------------------------------------------------------

    const instagramUrl =
        'https://www.instagram.com/tedxdypakurdi/';

    const instaX =
        pageW / 2 + 40;

    doc
        .save()
        .lineWidth(1.4)
        .strokeColor(COLORS.WHITE)
        .roundedRect(
            instaX,
            centerY - 9,
            18,
            18,
            5
        )
        .stroke()
        .circle(
            instaX + 9,
            centerY,
            4
        )
        .stroke()
        .circle(
            instaX + 14,
            centerY - 4.5,
            1.1
        )
        .fill(COLORS.WHITE)
        .restore();

    const instagramTextX =
        instaX + 28;

    const instagramTextW = 100;

    doc
        .font(fonts.bold)
        .fontSize(8)
        .fillColor(COLORS.WHITE)
        .text(
            'tedxdypakurdi',
            instagramTextX,
            centerY - 5,
            {
                width: instagramTextW,
                lineBreak: false
            }
        );

    // Clickable Instagram area
    doc.link(
        instaX - 4,
        centerY - 14,
        instagramTextW + 34,
        28,
        instagramUrl
    );
}

// -----------------------------------------------------------------------------
// MAIN PDF GENERATOR
// -----------------------------------------------------------------------------

export const generateTicketPDF = async (
    ticketData
) => {
    // -------------------------------------------------------------------------
    // VALIDATION
    // -------------------------------------------------------------------------

    if (
        !ticketData ||
        typeof ticketData !== 'object'
    ) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Ticket data is required'
        );
    }

    if (!ticketData.ticketId) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Ticket ID is required'
        );
    }

    // -------------------------------------------------------------------------
    // GENERATE QR USING EXISTING QR SERVICE
    // -------------------------------------------------------------------------

    const qrCodeBuffer =
        await generateQRCode(
            ticketData.ticketId
        );

    // -------------------------------------------------------------------------
    // CHECK REQUIRED ASSETS
    // -------------------------------------------------------------------------

    if (!exists(LOGO_PATH)) {
        throw new ApiError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `TEDx Mosaic logo not found: ${LOGO_PATH}`
        );
    }

    for (
        const [fontName, fontPath]
        of Object.entries(fonts)
    ) {
        if (!exists(fontPath)) {
            throw new ApiError(
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Font "${fontName}" not found: ${fontPath}`
            );
        }
    }

    // -------------------------------------------------------------------------
    // DOCUMENT
    // -------------------------------------------------------------------------

    const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        autoFirstPage: true,

        info: {
            Title: 'TEDxDYP Akurdi - Ticket',
            Author: 'TEDxDYP Akurdi',
            Subject: 'TEDxDYP Akurdi Ticket',
            Creator: 'TEDxDYP Akurdi'
        }
    });

    // Register fonts
    doc.registerFont(
        'SpaceGrotesk-Regular',
        fonts.regular
    );

    doc.registerFont(
        'SpaceGrotesk-Medium',
        fonts.medium
    );

    doc.registerFont(
        'SpaceGrotesk-SemiBold',
        fonts.semibold
    );

    doc.registerFont(
        'SpaceGrotesk-Bold',
        fonts.bold
    );

    doc.registerFont(
        'VT323',
        fonts.mono
    );

    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // -------------------------------------------------------------------------
    // COLLECT PDF BUFFER
    // -------------------------------------------------------------------------

    const chunks = [];

    return await new Promise(
        (resolve, reject) => {
            doc.on(
                'data',
                (chunk) => chunks.push(chunk)
            );

            doc.on(
                'end',
                () => {
                    resolve(
                        Buffer.concat(chunks)
                    );
                }
            );

            doc.on(
                'error',
                (error) => reject(error)
            );

            try {
                // -------------------------------------------------------------
                // PAGE BACKGROUND
                // -------------------------------------------------------------

                doc
                    .rect(
                        0,
                        0,
                        pageW,
                        pageH
                    )
                    .fill(COLORS.OFF_WHITE);

                // -------------------------------------------------------------
                // HEADER
                // -------------------------------------------------------------

                const headerH =
                    drawHeader(
                        doc,
                        pageW
                    );

                const marginX = 27;

                const contentW =
                    pageW - marginX * 2;

                let y =
                    headerH + 20;

                // -------------------------------------------------------------
                // TITLE ROW
                // -------------------------------------------------------------

                const titleH =
                    drawTicketTitle(
                        doc,
                        pageW,
                        y
                    );

                y +=
                    titleH + 18;

                // -------------------------------------------------------------
                // TICKET CARD
                // -------------------------------------------------------------

                const cardH =
                    drawTicketCard(
                        doc,
                        ticketData,
                        qrCodeBuffer,
                        pageW,
                        marginX,
                        y,
                        contentW
                    );

                y +=
                    cardH + 18;

                // -------------------------------------------------------------
                // NOTE
                // -------------------------------------------------------------

                drawNote(
                    doc,
                    marginX,
                    y,
                    contentW
                );

                // -------------------------------------------------------------
                // FOOTER
                // -------------------------------------------------------------

                drawFooter(
                    doc,
                    pageW,
                    pageH
                );

                // -------------------------------------------------------------
                // FINISH
                // -------------------------------------------------------------

                doc.end();

            } catch (error) {
                reject(error);
            }
        }
    );
};
