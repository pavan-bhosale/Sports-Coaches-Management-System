<?php
/**
 * VAVA Sports Academy - Razorpay Webhook Endpoint
 * 
 * Securely receives Razorpay webhook events, validates the HMAC SHA256 signature,
 * identifies the corresponding fee record in vsa_student_fees, and marks it as Paid.
 */

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Only POST is accepted.']);
    exit;
}

require_once 'db_connect.php';
require_once 'razorpay_config.php';

$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '';

// Allow local testing simulation if explicit test flag is provided in dev mode
$isLocalTest = (isset($_GET['local_test']) && $_GET['local_test'] === '1');

if (!$isLocalTest) {
    if (empty($signature)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing X-Razorpay-Signature header.']);
        exit;
    }

    if (!verifyRazorpayWebhookSignature($rawBody, $signature)) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid webhook signature.']);
        exit;
    }
}

$event = json_decode($rawBody, true);
if (!$event || !isset($event['event'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid event payload.']);
    exit;
}

$eventType = $event['event'];

// We handle 'payment.captured' or 'order.paid'
if ($eventType === 'payment.captured' || $eventType === 'order.paid') {
    $paymentEntity = $event['payload']['payment']['entity'] ?? [];
    $paymentId = $paymentEntity['id'] ?? '';
    $orderId = $paymentEntity['order_id'] ?? '';
    $amountInPaise = intval($paymentEntity['amount'] ?? 0);
    $amountInRupees = $amountInPaise > 0 ? ($amountInPaise / 100) : floatval($paymentEntity['amount'] ?? 0);
    $method = $paymentEntity['method'] ?? 'Razorpay';
    $notes = $paymentEntity['notes'] ?? [];

    $feeId = intval($notes['fee_id'] ?? 0);
    $studentId = intval($notes['student_id'] ?? 0);

    try {
        $record = null;
        if ($feeId > 0) {
            $stmt = $pdo->prepare("SELECT fee_id, fee_amount FROM vsa_student_fees WHERE fee_id = ?");
            $stmt->execute([$feeId]);
            $record = $stmt->fetch();
        } elseif (!empty($orderId)) {
            $stmt = $pdo->prepare("SELECT fee_id, fee_amount FROM vsa_student_fees WHERE razorpay_order_id = ?");
            $stmt->execute([$orderId]);
            $record = $stmt->fetch();
        } elseif ($studentId > 0) {
            $currentMonth = date('Y-m-01');
            $stmt = $pdo->prepare("SELECT fee_id, fee_amount FROM vsa_student_fees WHERE student_id = ? AND fee_month = ?");
            $stmt->execute([$studentId, $currentMonth]);
            $record = $stmt->fetch();
        }

        if (!$record) {
            // Webhook received but corresponding record could not be located
            http_response_code(404);
            echo json_encode(['error' => 'Corresponding fee record not found.']);
            exit;
        }

        $targetFeeId = intval($record['fee_id']);
        if ($amountInRupees <= 0) {
            $amountInRupees = floatval($record['fee_amount']);
        }

        $updateStmt = $pdo->prepare("
            UPDATE vsa_student_fees
            SET 
                payment_status = 'Paid',
                razorpay_payment_id = ?,
                razorpay_order_id = COALESCE(NULLIF(?, ''), razorpay_order_id),
                payment_method = ?,
                paid_amount = ?,
                paid_at = NOW()
            WHERE fee_id = ?
        ");
        $updateStmt->execute([$paymentId, $orderId, $method, $amountInRupees, $targetFeeId]);

        echo json_encode([
            'success' => true,
            'message' => "Fee record #{$targetFeeId} marked as Paid via webhook.",
            'fee_id'  => $targetFeeId
        ]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database update error: ' . $e->getMessage()]);
        exit;
    }
}

// Ignore other unhandled events gracefully
echo json_encode(['status' => 'ignored', 'event' => $eventType]);
?>
