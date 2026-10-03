import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SCANNER_TOKEN_SECRET = 'scanner-token-secret-for-tests-with-more-than-32-bytes';
process.env.SCANNER_ACCESS_CODE = 'event-access-code-test';

const { createSharedScannerToken, fingerprintScannerAccessCode, verifyScannerToken } = await import('../services/scanner-auth.service.js');
const { default: adminAuth } = await import('../middlewares/adminAuth.js');
const { default: ScannerOperator } = await import('../models/scannerOperator.model.js');

test('shared scanner tokens are signed, identify the event scanner, and reject tampering', () => {
    const token = createSharedScannerToken().token;
    const [header, payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(payload, 'base64url');
    tamperedPayload[0] ^= 1;

    assert.equal(verifyScannerToken(token)?.username, 'Event Scanner');
    assert.equal(verifyScannerToken(token)?.deviceId, 'event-scanner');
    assert.equal(verifyScannerToken(`${header}.${tamperedPayload.toString('base64url')}.${signature}`), null);
    assert.equal(verifyScannerToken('not-a-token'), null);
    assert.equal(verifyScannerToken(token)?.authMode, 'shared');
    assert.equal(verifyScannerToken(token)?.accessCodeFingerprint, fingerprintScannerAccessCode(process.env.SCANNER_ACCESS_CODE));
    assert.notEqual(verifyScannerToken(token)?.accessCodeFingerprint, fingerprintScannerAccessCode('another-code'));
    assert.equal(createSharedScannerToken().expiresIn, 12 * 60 * 60);
});

test('shared scanner token creation fails closed when the signing secret is too short', () => {
    const configuredSecret = process.env.SCANNER_TOKEN_SECRET;
    process.env.SCANNER_TOKEN_SECRET = 'short';
    try {
        assert.throws(() => createSharedScannerToken(), { statusCode: 503 });
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

test('scanner operator model retains fields needed to display historical audit records', () => {
    assert.ok(ScannerOperator.schema.path('username'));
    assert.ok(ScannerOperator.schema.path('role'));
    assert.equal(ScannerOperator.schema.path('passwordHash'), undefined);
});
