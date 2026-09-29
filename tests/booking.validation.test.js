import test from 'node:test';
import assert from 'node:assert/strict';

import { bookingSchema } from '../validations/booking.validation.js';

test('bookingSchema strips empty session IDs before validating', () => {
    const validPayload = {
        name: 'Abaan Ansari',
        email: 'abaanansari1427@gmail.com',
        phone: '8999226599',
        selectedSessions: ['6ab92bfeb41196a558bd6f4d'],
        ticketCount: 1,
    };

    const parsed = bookingSchema.parse(validPayload);
    assert.deepEqual(parsed.selectedSessions, ['6ab92bfeb41196a558bd6f4d']);
});

test('bookingSchema rejects all-empty session selections', () => {
    const invalidPayload = {
        name: 'Abaan Ansari',
        email: 'abaanansari1427@gmail.com',
        phone: '8999226599',
        selectedSessions: [''],
        ticketCount: 1,
    };

    assert.throws(() => bookingSchema.parse(invalidPayload), /Select at least one session/);
});

test('bookingSchema rejects predefined session aliases', () => {
    const payload = {
        name: 'Abaan Ansari',
        email: 'abaanansari1427@gmail.com',
        phone: '8999226599',
        selectedSessions: ['morning'],
        ticketCount: 1,
    };

    assert.throws(() => bookingSchema.parse(payload), /Session IDs must be valid MongoDB ObjectIds/);
});
