<?php
/**
 * VAVA Sports Academy - Razorpay Configuration
 * 
 * Credentials can be set via environment variables or configured here.
 * Never commit sensitive live keys to public version control.
 */

define('RAZORPAY_KEY_ID', getenv('RAZORPAY_KEY_ID') ?: 'rzp_test_vava_sports');
define('RAZORPAY_KEY_SECRET', getenv('RAZORPAY_KEY_SECRET') ?: 'vava_secret_key_mock_9921');
define('RAZORPAY_WEBHOOK_SECRET', getenv('RAZORPAY_WEBHOOK_SECRET') ?: 'vava_webhook_secret_8832');
define('RAZORPAY_CURRENCY', 'INR');

/**
 * Verify Razorpay payment signature
 * Signature format: HMAC_SHA256(order_id + "|" + payment_id, secret)
 */
function verifyRazorpayPaymentSignature($orderId, $paymentId, $signature) {
    if (empty($orderId) || empty($paymentId) || empty($signature)) {
        return false;
    }
    $expectedSignature = hash_hmac('sha256', $orderId . '|' . $paymentId, RAZORPAY_KEY_SECRET);
    return hash_equals($expectedSignature, $signature);
}

/**
 * Verify Razorpay webhook signature
 * Header: X-Razorpay-Signature
 */
function verifyRazorpayWebhookSignature($rawPayload, $signature) {
    if (empty($rawPayload) || empty($signature)) {
        return false;
    }
    $expectedSignature = hash_hmac('sha256', $rawPayload, RAZORPAY_WEBHOOK_SECRET);
    return hash_equals($expectedSignature, $signature);
}
?>
