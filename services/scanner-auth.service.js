import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const getTokenSecret = () => {
    const secret = process.env.SCANNER_TOKEN_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
        const error = new Error('Scanner authentication is not configured. Set SCANNER_TOKEN_SECRET to at least 32 bytes.');
        error.statusCode = 503;
        throw error;
    }
    return secret;
};

export const fingerprintScannerAccessCode = (accessCode) =>
    createHmac('sha256', getTokenSecret()).update(`scanner-access:${accessCode}`).digest('base64url');

export const createSharedScannerToken = () => {
    const accessCode = process.env.SCANNER_ACCESS_CODE;
    if (!accessCode || Buffer.byteLength(accessCode) < 8) {
        const error = new Error('Scanner access is not configured. Set SCANNER_ACCESS_CODE to at least 8 characters.');
        error.statusCode = 503;
        throw error;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({
        sub: 'shared-event-scanner',
        username: 'Event Scanner',
        role: 'SCANNER',
        deviceId: 'event-scanner',
        authMode: 'shared',
        accessCodeFingerprint: fingerprintScannerAccessCode(accessCode),
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
    });
    const content = `${header}.${payload}`;
    const signature = createHmac('sha256', getTokenSecret()).update(content).digest('base64url');
    return { token: `${content}.${signature}`, expiresIn: TOKEN_LIFETIME_SECONDS };
};

export const verifyScannerToken = (token) => {
    const [headerText, payloadText, signatureText, extra] = String(token || '').split('.');
    if (!headerText || !payloadText || !signatureText || extra) return null;

    try {
        const header = JSON.parse(Buffer.from(headerText, 'base64url').toString('utf8'));
        if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

        const content = `${headerText}.${payloadText}`;
        const expected = createHmac('sha256', getTokenSecret()).update(content).digest();
        const provided = Buffer.from(signatureText, 'base64url');
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

        const payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'));
        const now = Math.floor(Date.now() / 1000);
        if (
            payload.sub !== 'shared-event-scanner' ||
            payload.username !== 'Event Scanner' ||
            payload.role !== 'SCANNER' ||
            payload.deviceId !== 'event-scanner' ||
            payload.authMode !== 'shared' ||
            typeof payload.accessCodeFingerprint !== 'string' ||
            !Number.isInteger(payload.iat) ||
            !Number.isInteger(payload.exp) ||
            payload.iat > now ||
            payload.exp <= now
        ) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
};
