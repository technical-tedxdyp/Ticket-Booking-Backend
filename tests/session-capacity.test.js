import test from 'node:test';
import assert from 'node:assert/strict';
import Booking from '../models/booking.model.js';

import {
    collectSeatSessionIds,
    countPendingReservations,
    getBookingSeatSessionIds,
    hasSelectedIncludedSession,
} from '../services/session-capacity.service.js';

test('full-day selection expands to its own and component session inventory', () => {
    const sessions = [
        {
            _id: 'full-day-id',
            includedSessions: [{ _id: 'morning-id' }, { _id: 'evening-id' }],
        },
    ];

    assert.deepEqual(collectSeatSessionIds(sessions), ['full-day-id', 'morning-id', 'evening-id']);
});

test('component sessions are deduplicated when selected with the full-day bundle', () => {
    const sessions = [
        { _id: 'full-day-id', includedSessions: [{ _id: 'morning-id' }, { _id: 'evening-id' }] },
        { _id: 'morning-id', includedSessions: [] },
    ];

    assert.deepEqual(collectSeatSessionIds(sessions), ['full-day-id', 'morning-id', 'evening-id']);
});

test('a component cannot be purchased alongside the bundle that includes it', () => {
    const sessions = [
        { _id: 'full-day-id', includedSessions: [{ _id: 'morning-id' }, { _id: 'evening-id' }] },
        { _id: 'morning-id', includedSessions: [] },
    ];

    assert.equal(hasSelectedIncludedSession(sessions), true);
    assert.equal(hasSelectedIncludedSession([sessions[0]]), false);
});

test('payment and release use the exact inventory IDs stored on the booking', () => {
    const booking = {
        selectedSessions: ['full-day-id'],
        seatSessionIds: ['full-day-id', 'morning-id', 'evening-id'],
    };

    assert.deepEqual(getBookingSeatSessionIds(booking), ['full-day-id', 'morning-id', 'evening-id']);
});

test('legacy bookings fall back to their selected session IDs', () => {
    assert.deepEqual(getBookingSeatSessionIds({ selectedSessions: ['morning-id'] }), ['morning-id']);
});

test('reserved-seat reconciliation counts pending bookings only and expands stored seat sessions', () => {
    const counts = countPendingReservations([
        {
            bookingStatus: 'PENDING',
            ticketCount: 2,
            selectedSessions: ['full-day-id'],
            seatSessionIds: ['full-day-id', 'morning-id', 'evening-id'],
        },
        { bookingStatus: 'EXPIRED', ticketCount: 1, selectedSessions: ['morning-id'] },
        { bookingStatus: 'TICKET_GENERATED', ticketCount: 1, selectedSessions: ['evening-id'] },
    ]);

    assert.deepEqual(
        [...counts],
        [
            ['full-day-id', 2],
            ['morning-id', 2],
            ['evening-id', 2],
        ],
    );
});

test('booking expiration index does not use MongoDB TTL deletion', () => {
    const indexes = Booking.schema.indexes();

    assert.equal(
        indexes.some(([, options]) => options.expireAfterSeconds !== undefined),
        false,
    );
    assert.equal(
        indexes.some(([keys]) => keys.bookingStatus === 1 && keys.reservationExpiresAt === 1),
        true,
    );
});
