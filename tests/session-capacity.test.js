import test from 'node:test';
import assert from 'node:assert/strict';

import { collectSeatSessionIds, getBookingSeatSessionIds, hasSelectedIncludedSession } from '../services/session-capacity.service.js';

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
