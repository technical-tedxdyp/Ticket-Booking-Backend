import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SCANNER_TOKEN_SECRET = 'scanner-token-secret-for-tests-with-more-than-32-bytes';

const { createScannerToken, hashScannerPassword, verifyScannerPassword, verifyScannerToken } = await import('../services/scanner-auth.service.js');
const { default: adminAuth } = await import('../middlewares/adminAuth.js');
const { default: ScannerDevice } = await import('../models/scannerDevice.model.js');
const { default: ScannerOperator } = await import('../models/scannerOperator.model.js');

test('scanner password hashes verify only the original password', async () => {
    const passwordHash = await hashScannerPassword('correct horse battery staple');

    assert.equal(await verifyScannerPassword('correct horse battery staple', passwordHash), true);
    assert.equal(await verifyScannerPassword('incorrect password', passwordHash), false);
    assert.equal(await verifyScannerPassword('anything', 'malformed-hash'), false);
});

test('scanner tokens are signed, include device identity, and reject tampering', () => {
    const token = createScannerToken({
        operatorId: '66a123456789012345678901',
        username: 'scanner.one',
        role: 'SCANNER',
        tokenVersion: 2,
        deviceId: 'entrance-device-01',
        deviceVersion: 3,
    }).token;
    const [header, payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(payload, 'base64url');
    tamperedPayload[0] ^= 1;

    assert.equal(verifyScannerToken(token)?.username, 'scanner.one');
    assert.equal(verifyScannerToken(token)?.deviceId, 'entrance-device-01');
    assert.equal(verifyScannerToken(`${header}.${tamperedPayload.toString('base64url')}.${signature}`), null);
    assert.equal(verifyScannerToken('not-a-token'), null);
});

test('scanner token creation fails closed when the signing secret is too short', () => {
    const configuredSecret = process.env.SCANNER_TOKEN_SECRET;
    process.env.SCANNER_TOKEN_SECRET = 'short';
    try {
        assert.throws(
            () =>
                createScannerToken({
                    operatorId: 'operator',
                    username: 'scanner',
                    role: 'SCANNER',
                    tokenVersion: 0,
                    deviceId: 'device-id',
                    deviceVersion: 0,
                }),
            {
                statusCode: 503,
            },
        );
    } finally {
        process.env.SCANNER_TOKEN_SECRET = configuredSecret;
    }
});

test('admin authentication requires the configured secret in a header', () => {
    const configuredSecret = process.env.ADMIN_SECRET_KEY;
    process.env.ADMIN_SECRET_KEY = 'admin-secret-for-tests-with-at-least-32-bytes';
    try {
        let continued = false;
        adminAuth({ headers: { 'x-admin-key': process.env.ADMIN_SECRET_KEY }, query: {} }, {}, () => {
            continued = true;
        });
        assert.equal(continued, true);

        assert.throws(() => adminAuth({ headers: {}, query: { key: process.env.ADMIN_SECRET_KEY } }, {}, () => {}), { statusCode: 401 });
        process.env.ADMIN_SECRET_KEY = 'short';
        assert.throws(() => adminAuth({ headers: {}, query: {} }, {}, () => {}), { statusCode: 503 });
    } finally {
        if (configuredSecret === undefined) delete process.env.ADMIN_SECRET_KEY;
        else process.env.ADMIN_SECRET_KEY = configuredSecret;
    }
});

test('scanner credential models hide hashes and expose token revocation versions', () => {
    assert.equal(ScannerOperator.schema.path('passwordHash').options.select, false);
    assert.equal(ScannerDevice.schema.path('secretHash').options.select, false);
    assert.equal(ScannerOperator.schema.path('tokenVersion').defaultValue, 0);
    assert.equal(ScannerDevice.schema.path('tokenVersion').defaultValue, 0);
});
