import test from 'node:test';
import assert from 'node:assert/strict';
import EntryLog from '../models/entryLog.model.js';
import Booking from '../models/booking.model.js';
import ScanAttempt from '../models/scanAttempt.model.js';
import { scannerAnalyticsQuerySchema, scanReportQuerySchema } from '../validations/scanner.validation.js';
import { resolveEntitledSessions, selectAdmissionSession } from '../services/ticket-admission.service.js';

test('a Full Day bundle grants admission to its included Morning and Evening sessions', () => {
    const sessions = resolveEntitledSessions([
        {
            _id: 'full-day-id',
            title: 'Full Day Session',
            day: 1,
            includedSessions: [
                { _id: 'morning-id', title: 'Morning Session', day: 1 },
                { _id: 'evening-id', title: 'Evening Session', day: 1 },
            ],
        },
    ]);

    assert.deepEqual(
        sessions.map(({ id, title }) => ({ id, title })),
        [
            { id: 'morning-id', title: 'Morning Session' },
            { id: 'evening-id', title: 'Evening Session' },
        ],
    );
});

test('a single-session booking only grants admission to its selected session', () => {
    const sessions = resolveEntitledSessions([{ _id: 'morning-id', title: 'Morning Session', day: 1, includedSessions: [] }]);

    assert.deepEqual(
        sessions.map(({ id }) => id),
        ['morning-id'],
    );
});

test('duplicate entitled sessions are returned once', () => {
    const sessions = resolveEntitledSessions([
        { _id: 'morning-id', title: 'Morning Session', day: 1, includedSessions: [] },
        { _id: 'morning-id', title: 'Morning Session', day: 1, includedSessions: [] },
    ]);

    assert.equal(sessions.length, 1);
});

test('a single-session booking can be checked in without an explicit session selection', () => {
    const [session] = resolveEntitledSessions([{ _id: 'morning-id', title: 'Morning Session' }]);

    assert.equal(selectAdmissionSession([session]), session);
});

test('a multi-session booking requires an explicit session selection', () => {
    const sessions = resolveEntitledSessions([
        {
            _id: 'full-day-id',
            includedSessions: [
                { _id: 'morning-id', title: 'Morning Session' },
                { _id: 'evening-id', title: 'Evening Session' },
            ],
        },
    ]);

    assert.equal(selectAdmissionSession(sessions), null);
    assert.equal(selectAdmissionSession(sessions, 'evening-id'), sessions[1]);
    assert.equal(selectAdmissionSession(sessions, 'other-session-id'), null);
});

test('entry logs enforce one initial admission per booking and session', () => {
    const admissionIndex = EntryLog.schema.indexes().find(([keys, options]) => {
        return keys.booking === 1 && keys.session === 1 && keys.action === 1 && options.unique;
    });

    assert.deepEqual(admissionIndex?.[1].partialFilterExpression, { action: 'ENTRY' });
});

test('scan attempts are indexed for recent activity and outcome analytics', () => {
    const indexes = ScanAttempt.schema.indexes().map(([keys]) => keys);

    assert.ok(indexes.some((keys) => keys.scannedAt === -1));
    assert.ok(indexes.some((keys) => keys.outcome === 1 && keys.scannedAt === -1));
});

test('booking session IDs are populated from Session records', () => {
    assert.equal(Booking.schema.path('selectedSessions').options.type[0].ref, 'Session');
});

test('scan reports validate filters and enforce ordered date ranges', () => {
    const validReport = scanReportQuerySchema.safeParse({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
        outcome: 'DENIED',
        limit: '100',
    });
    const invalidRange = scannerAnalyticsQuerySchema.safeParse({
        from: '2026-10-02T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
    });
    const invalidLimit = scanReportQuerySchema.safeParse({ limit: '101' });

    assert.equal(validReport.success, true);
    assert.equal(invalidRange.success, false);
    assert.equal(invalidLimit.success, false);
});
