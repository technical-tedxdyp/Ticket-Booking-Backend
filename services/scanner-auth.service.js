import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto';

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
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

export const hashScannerPassword = async (password) => {
    const salt = randomBytes(16);
    const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt$16384$8$1$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
};

export const DUMMY_PASSWORD_HASH = await hashScannerPassword(randomBytes(24).toString('base64url'));

export const verifyScannerPassword = async (password, passwordHash) => {
    const [algorithm, cost, blockSize, parallelization, saltText, keyText] = String(passwordHash || '').split('$');
    if (algorithm !== 'scrypt' || !saltText || !keyText) return false;

    try {
        const expected = Buffer.from(keyText, 'base64url');
        const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, {
            N: Number(cost),
            r: Number(blockSize),
            p: Number(parallelization),
            maxmem: 64 * 1024 * 1024,
        });
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
};

export const createScannerToken = ({ operatorId, username, role, tokenVersion, deviceId, deviceVersion }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({
        sub: String(operatorId),
        username,
        role,
        ver: tokenVersion,
        deviceId,
        deviceVer: deviceVersion,
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
        if (
            !payload.sub ||
            !payload.username ||
            !payload.deviceId ||
            !Number.isInteger(payload.ver) ||
            !Number.isInteger(payload.deviceVer) ||
            !Number.isInteger(payload.iat) ||
            !Number.isInteger(payload.exp) ||
            payload.iat > Math.floor(Date.now() / 1000) ||
            payload.exp <= Math.floor(Date.now() / 1000)
        ) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
};
