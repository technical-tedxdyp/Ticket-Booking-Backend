import test from 'node:test';
import assert from 'node:assert/strict';
import logger from '../utils/logger.js';

test('logger preserves Error details passed as metadata', () => {
    const originalConsoleError = console.error;
    let loggedMessage;

    console.error = (message) => {
        loggedMessage = message;
    };

    try {
        logger.error('Payment verification error:', new Error('ticket validation failed'));
    } finally {
        console.error = originalConsoleError;
    }

    assert.match(loggedMessage, /ticket validation failed/);
    assert.match(loggedMessage, /Error: ticket validation failed/);
});
