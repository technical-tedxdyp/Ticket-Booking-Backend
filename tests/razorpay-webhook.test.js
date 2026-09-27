import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.IS_RAZOR_PAY_ENABLE = 'true';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
process.env.RAZORPAY_KEY_SECRET = 'test_secret_123';

const { verifyWebhookSignature, verifyPaymentSignature } = await import('../providers/razorpay.js');

test('verifyWebhookSignature accepts the raw JSON body and expected webhook signature', () => {
    const payload = {
        event: 'payment.captured',
        payload: {
            payment: {
                entity: {
                    id: 'pay_test_123',
                    order_id: 'order_test_123',
                    status: 'captured',
                },
            },
        },
    };

    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');

    assert.equal(verifyWebhookSignature(rawBody, signature), true);
    assert.equal(verifyWebhookSignature(rawBody, 'bad_signature'), false);
});

test('verifyPaymentSignature matches Razorpay checksum format and is case-safe', () => {
    const orderId = 'order_test_123';
    const paymentId = 'pay_test_456';
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

    assert.equal(
        verifyPaymentSignature({
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
        }),
        true,
    );
    assert.equal(
        verifyPaymentSignature({
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature.toUpperCase(),
        }),
        true,
    );
    assert.equal(
        verifyPaymentSignature({
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: 'bad_signature',
        }),
        false,
    );
});
