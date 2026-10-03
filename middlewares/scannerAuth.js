import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import { fingerprintScannerAccessCode, verifyScannerToken } from '../services/scanner-auth.service.js';

const scannerAuth = (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const claims = verifyScannerToken(token);
    if (!claims) return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Scanner authentication required'));

    const configuredCode = process.env.SCANNER_ACCESS_CODE;
    if (!configuredCode || Buffer.byteLength(configuredCode) < 8) {
        return next(new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'Scanner access is not configured.'));
    }

    if (claims.accessCodeFingerprint !== fingerprintScannerAccessCode(configuredCode)) {
        return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Scanner access code has been rotated'));
    }

    req.scannerOperator = {
        id: null,
        username: 'Event Scanner',
        role: 'SCANNER',
        deviceId: 'event-scanner',
    };
    return next();
};

export default scannerAuth;
