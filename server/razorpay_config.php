<?php
/**
 * VAVA Sports Academy - Razorpay Configuration
 * 
 * Credentials can be set via environment variables or configured here.
 * Never commit sensitive live keys to public version control.
 */

require_once __DIR__ . '/config.php';

$rzpConfig = getRazorpayConfig();
if (!defined('RAZORPAY_KEY_ID')) {
    define('RAZORPAY_KEY_ID', !empty($rzpConfig['key_id']) ? $rzpConfig['key_id'] : 'rzp_test_vava_sports');
}
if (!defined('RAZORPAY_KEY_SECRET')) {
    define('RAZORPAY_KEY_SECRET', !empty($rzpConfig['key_secret']) ? $rzpConfig['key_secret'] : 'vava_secret_key_mock_9921');
}
if (!defined('RAZORPAY_WEBHOOK_SECRET')) {
    define('RAZORPAY_WEBHOOK_SECRET', !empty($rzpConfig['webhook_secret']) ? $rzpConfig['webhook_secret'] : 'vava_webhook_secret_8832');
}
if (!defined('RAZORPAY_CURRENCY')) {
    define('RAZORPAY_CURRENCY', !empty($rzpConfig['currency']) ? $rzpConfig['currency'] : 'INR');
}

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
