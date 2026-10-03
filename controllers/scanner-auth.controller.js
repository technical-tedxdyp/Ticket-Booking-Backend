import { timingSafeEqual } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createSharedScannerToken } from '../services/scanner-auth.service.js';

export const loginWithScannerAccessCode = asyncHandler(async (req, res) => {
    const configuredCode = process.env.SCANNER_ACCESS_CODE;
    if (!configuredCode || Buffer.byteLength(configuredCode) < 8) {
        throw new ApiError(StatusCodes.SERVICE_UNAVAILABLE, 'Scanner access is not configured.');
    }

    const provided = Buffer.from(req.body.accessCode);
    const expected = Buffer.from(configuredCode);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid scanner access code.');
    }

    const tokenData = createSharedScannerToken();
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Scanner authenticated successfully', {
            token: tokenData.token,
            tokenType: 'Bearer',
            expiresIn: tokenData.expiresIn,
            scanner: 'Event Scanner',
        }),
    );
});

export const logoutScanner = asyncHandler(async (req, res) =>
    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Scanner session cleared')),
);
