import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import express from 'express';
import mongoose from 'mongoose';

process.env.ADMIN_SECRET_KEY = 'admin-test-secret-that-is-at-least-thirty-two-bytes';
process.env.SCANNER_TOKEN_SECRET = 'scanner-test-secret-that-is-at-least-thirty-two-bytes';
process.env.SCANNER_ACCESS_CODE = 'event-access-code-test';
process.env.NODE_ENV = 'test';

const [{ default: adminRoutes }, { default: errorHandler }] = await Promise.all([
    import('../routes/admin.route.js'),
    import('../middlewares/error.middleware.js'),
]);
const { default: Booking } = await import('../models/booking.model.js');
const { default: EntryLog } = await import('../models/entryLog.model.js');
const { default: Event } = await import('../models/event.model.js');
const { default: ScanAttempt } = await import('../models/scanAttempt.model.js');
const { default: Session } = await import('../models/session.model.js');
const mongodAvailable = spawnSync('mongod', ['--version'], { stdio: 'ignore' }).status === 0;

const getFreePort = async () =>
    new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close((error) => (error ? reject(error) : resolve(port)));
        });
    });

const waitForMongo = async (child, port) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`mongod exited before becoming ready (${child.exitCode}).`);
        const connected = await new Promise((resolve) => {
            const socket = net.createConnection({ host: '127.0.0.1', port });
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', () => resolve(false));
        });
        if (connected) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for the isolated mongod process.');
};

const postJson = (baseUrl, route, body, token) =>
    fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });

test(
    'scanner routes authenticate with the shared access code, enforce session admission, and audit reports',
    { skip: !mongodAvailable && 'mongod is required for the isolated scanner integration test' },
    async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'tedx-scanner-integration-'));
        const port = await getFreePort();
        const mongod = spawn(
            'mongod',
            ['--replSet', 'scanner-tests', '--port', String(port), '--dbpath', directory, '--bind_ip', '127.0.0.1', '--quiet'],
            { stdio: 'ignore' },
        );
        let httpServer;

        try {
            await waitForMongo(mongod, port);
            await mongoose.connect(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 5000 });
            try {
                await mongoose.connection.db.admin().command({
                    replSetInitiate: {
                        _id: 'scanner-tests',
                        members: [{ _id: 0, host: `127.0.0.1:${port}` }],
                    },
                });
            } catch (error) {
                if (error.codeName !== 'AlreadyInitialized') throw error;
            }
            await mongoose.disconnect();

            const replicaSetUri = `mongodb://127.0.0.1:${port}/scanner_integration?replicaSet=scanner-tests`;
            let connected = false;
            let connectionError;
            for (let attempt = 0; attempt < 30 && !connected; attempt += 1) {
                try {
                    await mongoose.connect(replicaSetUri, { serverSelectionTimeoutMS: 1000 });
                    connected = true;
                } catch (error) {
                    connectionError = error;
                    await mongoose.disconnect();
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }
            if (!connected) throw connectionError || new Error('Temporary replica set did not elect a primary.');

            await Promise.all([
                Booking.createIndexes(),
                EntryLog.createIndexes(),
                Event.createIndexes(),
                ScanAttempt.createIndexes(),
                Session.createIndexes(),
            ]);

            const app = express();
            app.use(express.json());
            app.use('/api/admin', adminRoutes);
            app.use(errorHandler);
            httpServer = app.listen(0, '127.0.0.1');
            await new Promise((resolve) => httpServer.once('listening', resolve));
            const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

            const invalidSharedLoginResponse = await postJson(baseUrl, '/api/admin/scanner/access', { accessCode: 'incorrect-event-code' });
            assert.equal(invalidSharedLoginResponse.status, 401);

            const legacyLoginResponse = await fetch(`${baseUrl}/api/admin/scanner/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_SECRET_KEY },
                body: JSON.stringify({}),
            });
            assert.equal(legacyLoginResponse.status, 404);
            for (const path of ['/api/admin/scanner-devices', '/api/admin/scanner-operators']) {
                const legacyManagementResponse = await fetch(`${baseUrl}${path}`, {
                    headers: { 'x-admin-key': process.env.ADMIN_SECRET_KEY },
                });
                assert.equal(legacyManagementResponse.status, 404);
            }

            const sharedLoginResponse = await postJson(baseUrl, '/api/admin/scanner/access', { accessCode: process.env.SCANNER_ACCESS_CODE });
            assert.equal(sharedLoginResponse.status, 200);
            const {
                data: { token: sharedToken, scanner },
            } = await sharedLoginResponse.json();
            assert.equal(scanner, 'Event Scanner');
            const token = sharedToken;

            const unauthorizedResponse = await postJson(baseUrl, '/api/admin/scanner/ticket/verify', { ticketId: 'TEST-FULL-DAY' });
            assert.equal(unauthorizedResponse.status, 401);

            const event = await Event.create({
                title: 'Scanner Integration Event',
                startDate: new Date('2026-10-02T08:00:00.000Z'),
                endDate: new Date('2026-10-02T18:00:00.000Z'),
                isActive: true,
            });
            const [morning, evening] = await Session.create([
                {
                    event: event._id,
                    title: 'Morning Session',
                    speakers: ['Morning Speaker'],
                    day: 1,
                    startTime: new Date('2026-10-02T09:00:00.000Z'),
                    endTime: new Date('2026-10-02T12:00:00.000Z'),
                    price: 100,
                    totalSeats: 100,
                    isActive: true,
                },
                {
                    event: event._id,
                    title: 'Evening Session',
                    speakers: ['Evening Speaker'],
                    day: 1,
                    startTime: new Date('2026-10-02T14:00:00.000Z'),
                    endTime: new Date('2026-10-02T17:00:00.000Z'),
                    price: 100,
                    totalSeats: 100,
                    isActive: true,
                },
            ]);
            const fullDay = await Session.create({
                event: event._id,
                title: 'Full Day Session',
                speakers: ['Morning Speaker', 'Evening Speaker'],
                day: 1,
                startTime: morning.startTime,
                endTime: evening.endTime,
                price: 200,
                totalSeats: 100,
                includedSessions: [morning._id, evening._id],
                isActive: true,
            });
            await Booking.create({
                name: 'Full Day Attendee',
                email: 'full-day@example.com',
                phone: '+10000000000',
                selectedSessions: [String(fullDay._id)],
                seatSessionIds: [fullDay._id, morning._id, evening._id],
                ticketCount: 2,
                totalAmount: 400,
                bookingStatus: 'TICKET_GENERATED',
                ticketId: 'TEST-FULL-DAY',
                pdfUrl: 'https://example.com/ticket.pdf',
            });
            await Booking.create({
                name: 'Morning Attendee',
                email: 'morning@example.com',
                phone: '+10000000001',
                selectedSessions: [String(morning._id)],
                seatSessionIds: [morning._id],
                ticketCount: 1,
                totalAmount: 100,
                bookingStatus: 'TICKET_GENERATED',
                ticketId: 'TEST-MORNING',
                pdfUrl: 'https://example.com/morning.pdf',
            });

            const sharedVerify = await postJson(
                baseUrl,
                '/api/admin/scanner/ticket/verify',
                { ticketId: 'TEST-MORNING', sessionId: String(morning._id) },
                sharedToken,
            );
            assert.equal(sharedVerify.status, 200);
            assert.equal((await sharedVerify.json()).data.outcome, 'VERIFIED');

            const verifyMorning = await postJson(
                baseUrl,
                '/api/admin/scanner/ticket/verify',
                { ticketId: 'TEST-FULL-DAY', sessionId: String(morning._id) },
                token,
            );
            assert.equal(verifyMorning.status, 200);
            const verifiedMorning = await verifyMorning.json();
            assert.equal(verifiedMorning.data.valid, true);
            assert.equal(verifiedMorning.data.outcome, 'VERIFIED');
            assert.equal(verifiedMorning.data.entitledSessions.length, 2);

            const missingSessionCheckIn = await postJson(baseUrl, '/api/admin/scanner/ticket/check-in', { ticketId: 'TEST-FULL-DAY' }, token);
            assert.equal(missingSessionCheckIn.status, 400);

            const wrongSessionVerify = await postJson(
                baseUrl,
                '/api/admin/scanner/ticket/verify',
                { ticketId: 'TEST-MORNING', sessionId: String(evening._id) },
                token,
            );
            assert.equal((await wrongSessionVerify.json()).data.outcome, 'DENIED');

            const morningCheckIn = await postJson(
                baseUrl,
                '/api/admin/scanner/ticket/check-in',
                { ticketId: 'TEST-FULL-DAY', sessionId: String(morning._id) },
                token,
            );
            assert.equal(morningCheckIn.status, 200);
            const checkedInMorning = await morningCheckIn.json();
            assert.equal(checkedInMorning.data.booking.ticketCount, 2);
            assert.equal(checkedInMorning.data.entryLog.operator, null);
            assert.equal(checkedInMorning.data.entryLog.deviceId, 'event-scanner');

            const duplicateVerify = await postJson(
                baseUrl,
                '/api/admin/scanner/ticket/verify',
                { ticketId: 'TEST-FULL-DAY', sessionId: String(morning._id) },
                token,
            );
            assert.equal((await duplicateVerify.json()).data.outcome, 'DUPLICATE');

            const concurrentEveningCheckIns = await Promise.all([
                postJson(baseUrl, '/api/admin/scanner/ticket/check-in', { ticketId: 'TEST-FULL-DAY', sessionId: String(evening._id) }, token),
                postJson(baseUrl, '/api/admin/scanner/ticket/check-in', { ticketId: 'TEST-FULL-DAY', sessionId: String(evening._id) }, token),
            ]);
            assert.deepEqual(concurrentEveningCheckIns.map((response) => response.status).sort(), [200, 409]);

            const duplicateCheckIn = await postJson(
                baseUrl,
                '/api/admin/scanner/ticket/check-in',
                { ticketId: 'TEST-FULL-DAY', sessionId: String(morning._id) },
                token,
            );
            assert.equal(duplicateCheckIn.status, 409);
            assert.equal(await EntryLog.countDocuments({ booking: checkedInMorning.data.entryLog.booking, action: 'ENTRY' }), 2);

            const analyticsResponse = await fetch(`${baseUrl}/api/admin/scanner/analytics/scans`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            assert.equal(analyticsResponse.status, 200);
            const analytics = await analyticsResponse.json();
            assert.equal(analytics.data.scans.verified, 2);
            assert.equal(analytics.data.scans.denied, 2);
            assert.equal(analytics.data.scans.duplicate, 3);
            assert.equal(analytics.data.admissions.total, 2);
            assert.equal(analytics.data.admissions.uniqueBookings, 1);
            assert.equal(analytics.data.bySession.length, 2);

            const deniedAttemptsResponse = await fetch(`${baseUrl}/api/admin/scanner/scan-attempts?outcome=DENIED`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            assert.equal(deniedAttemptsResponse.status, 200);
            const deniedAttempts = await deniedAttemptsResponse.json();
            assert.equal(deniedAttempts.data.pagination.total, 2);

            const sharedActorAttempts = await ScanAttempt.find({ scannedBy: 'Event Scanner', deviceId: 'event-scanner' });
            assert.equal(sharedActorAttempts.length, analytics.data.scans.verified + analytics.data.scans.denied + analytics.data.scans.duplicate);
            assert.ok(sharedActorAttempts.every((attempt) => attempt.operator === null));

            const logoutResponse = await postJson(baseUrl, '/api/admin/scanner/logout', {}, token);
            assert.equal(logoutResponse.status, 200);
            process.env.SCANNER_ACCESS_CODE = 'rotated-event-access-code';
            const sharedTokenRevokedResponse = await fetch(`${baseUrl}/api/admin/scanner/analytics/scans`, {
                headers: { Authorization: `Bearer ${sharedToken}` },
            });
            assert.equal(sharedTokenRevokedResponse.status, 401);
        } finally {
            if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
            await mongoose.disconnect().catch(() => {});
            if (mongod.exitCode === null) {
                mongod.kill('SIGTERM');
                await new Promise((resolve) => {
                    if (mongod.exitCode !== null) return resolve();
                    mongod.once('exit', resolve);
                    setTimeout(resolve, 3000).unref();
                });
            }
            await rm(directory, { recursive: true, force: true });
        }
    },
);
