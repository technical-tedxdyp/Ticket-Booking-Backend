import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import ScannerOperator from '../models/scannerOperator.model.js';
import ScannerDevice from '../models/scannerDevice.model.js';
import { verifyScannerToken } from '../services/scanner-auth.service.js';

const scannerAuth = async (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const claims = verifyScannerToken(token);
    if (!claims) return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Scanner authentication required'));

    try {
        const [operator, device] = await Promise.all([
            ScannerOperator.findById(claims.sub).select('username role isActive tokenVersion'),
            ScannerDevice.findOne({ deviceId: claims.deviceId }).select('deviceId name isActive tokenVersion'),
        ]);
        if (
            !operator ||
            !operator.isActive ||
            operator.tokenVersion !== claims.ver ||
            !device ||
            !device.isActive ||
            device.tokenVersion !== claims.deviceVer
        ) {
            return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Scanner credentials have been revoked'));
        }

        req.scannerOperator = {
            id: operator._id,
            username: operator.username,
            role: operator.role,
            deviceId: device.deviceId,
            deviceName: device.name,
        };
        return next();
    } catch (error) {
        return next(error);
    }
};

export default scannerAuth;
