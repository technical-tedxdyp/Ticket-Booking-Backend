import { randomBytes } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import ScannerDevice from '../models/scannerDevice.model.js';
import ScannerOperator from '../models/scannerOperator.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createScannerToken, DUMMY_PASSWORD_HASH, hashScannerPassword, verifyScannerPassword } from '../services/scanner-auth.service.js';

export const loginScannerOperator = asyncHandler(async (req, res) => {
    const { username, password, deviceId, deviceSecret } = req.body;
    const [operator, device] = await Promise.all([
        ScannerOperator.findOne({ username: username.toLowerCase() }).select('+passwordHash'),
        ScannerDevice.findOne({ deviceId }).select('+secretHash'),
    ]);

    const [validOperatorPassword, validDeviceSecret] = await Promise.all([
        verifyScannerPassword(password, operator?.passwordHash || DUMMY_PASSWORD_HASH),
        verifyScannerPassword(deviceSecret, device?.secretHash || DUMMY_PASSWORD_HASH),
    ]);

    if (!operator || !operator.isActive || !validOperatorPassword || !device || !device.isActive || !validDeviceSecret) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid or inactive scanner credentials');
    }

    const tokenData = createScannerToken({
        operatorId: operator._id,
        username: operator.username,
        role: operator.role,
        tokenVersion: operator.tokenVersion,
        deviceId: device.deviceId,
        deviceVersion: device.tokenVersion,
    });

    const loggedInAt = new Date();
    await Promise.all([
        ScannerOperator.updateOne({ _id: operator._id }, { $set: { lastLoginAt: loggedInAt } }),
        ScannerDevice.updateOne({ _id: device._id }, { $set: { lastLoginAt: loggedInAt } }),
    ]);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Scanner authenticated successfully', {
            token: tokenData.token,
            tokenType: 'Bearer',
            expiresIn: tokenData.expiresIn,
            operator: { id: operator._id, username: operator.username, role: operator.role },
            device: { id: device.deviceId, name: device.name },
        }),
    );
});

export const logoutScannerOperator = asyncHandler(async (req, res) => {
    await ScannerOperator.updateOne({ _id: req.scannerOperator.id }, { $inc: { tokenVersion: 1 } });
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Scanner session revoked'));
});

export const createScannerOperator = asyncHandler(async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const operator = await ScannerOperator.create({ username, passwordHash: await hashScannerPassword(password), role });
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, 'Scanner operator created', {
                operator: { id: operator._id, username: operator.username, role: operator.role, isActive: operator.isActive },
            }),
        );
    } catch (error) {
        if (error.code === 11000) throw new ApiError(StatusCodes.CONFLICT, 'A scanner operator with this username already exists.');
        throw error;
    }
});

export const listScannerOperators = asyncHandler(async (req, res) => {
    const operators = await ScannerOperator.find().select('username role isActive lastLoginAt createdAt updatedAt').sort({ username: 1 }).lean();
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Scanner operators fetched', { operators }));
});

export const updateScannerOperator = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid scanner operator ID.');

    const updates = {};
    if (req.body.password) updates.passwordHash = await hashScannerPassword(req.body.password);
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    if (req.body.role) updates.role = req.body.role;

    const operator = await ScannerOperator.findByIdAndUpdate(id, { $set: updates, $inc: { tokenVersion: 1 } }, { returnDocument: 'after' }).select(
        'username role isActive tokenVersion',
    );
    if (!operator) throw new ApiError(StatusCodes.NOT_FOUND, 'Scanner operator not found.');

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Scanner operator updated and existing tokens revoked', {
            operator: { id: operator._id, username: operator.username, role: operator.role, isActive: operator.isActive },
        }),
    );
});

export const createScannerDevice = asyncHandler(async (req, res) => {
    const { deviceId, name } = req.body;
    const deviceSecret = randomBytes(32).toString('base64url');
    try {
        const device = await ScannerDevice.create({ deviceId, name, secretHash: await hashScannerPassword(deviceSecret) });
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, 'Scanner device provisioned. Store its secret securely; it will not be shown again.', {
                device: { id: device.deviceId, name: device.name, isActive: device.isActive },
                deviceSecret,
            }),
        );
    } catch (error) {
        if (error.code === 11000) throw new ApiError(StatusCodes.CONFLICT, 'A scanner device with this ID already exists.');
        throw error;
    }
});

export const listScannerDevices = asyncHandler(async (req, res) => {
    const devices = await ScannerDevice.find().select('deviceId name isActive lastLoginAt createdAt updatedAt').sort({ name: 1 }).lean();
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, 'Scanner devices fetched', { devices }));
});

export const updateScannerDevice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = {};
    let rotatedSecret;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    if (req.body.rotateSecret) {
        rotatedSecret = randomBytes(32).toString('base64url');
        updates.secretHash = await hashScannerPassword(rotatedSecret);
    }

    const device = await ScannerDevice.findOneAndUpdate(
        { deviceId: id },
        { $set: updates, $inc: { tokenVersion: 1 } },
        { returnDocument: 'after' },
    ).select('deviceId name isActive tokenVersion');
    if (!device) throw new ApiError(StatusCodes.NOT_FOUND, 'Scanner device not found.');

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, 'Scanner device updated and existing tokens revoked', {
            device: { id: device.deviceId, name: device.name, isActive: device.isActive },
            ...(rotatedSecret ? { deviceSecret: rotatedSecret } : {}),
        }),
    );
});
