
<?php
/**
 * VAVA Sports Academy - Meta WhatsApp Webhook Endpoint
 * 
 * Handles Meta Webhook Verification (GET hub.challenge)
 * and Delivery Status Callbacks (POST statuses: sent, delivered, read, failed).
 * 
 * Secure, signature-verified, and idempotent.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/meta_whatsapp_service.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$config = getMetaWhatsAppConfig();

// ============================================================================
// 1. WEBHOOK VERIFICATION (GET)
// ============================================================================
if ($method === 'GET') {
    $mode = $_GET['hub_mode'] ?? $_GET['hub.mode'] ?? '';
    $token = $_GET['hub_verify_token'] ?? $_GET['hub.verify_token'] ?? '';
    $challenge = $_GET['hub_challenge'] ?? $_GET['hub.challenge'] ?? '';

    $expectedToken = $config['webhook_verify_token'];

    if ($mode === 'subscribe' && !empty($expectedToken) && hash_equals((string)$expectedToken, (string)$token)) {
        header('Content-Type: text/plain; charset=utf-8');
        http_response_code(200);
        echo $challenge;
        exit;
    }

    http_response_code(403);
    echo json_encode(['error' => 'Webhook verification token mismatch or invalid mode.']);
    exit;
}

// ============================================================================
// 2. DELIVERY STATUS CALLBACKS (POST)
// ============================================================================
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use GET for verification or POST for events.']);
    exit;
}

$rawBody = file_get_contents('php://input');

// Require Meta App Secret: fail closed if missing or unconfigured (WEBHOOK-01)
if (empty($config['app_secret'])) {
    http_response_code(500);
    echo json_encode(['error' => 'Webhook signature verification unavailable: Meta app secret is not configured on server.']);
    exit;
}

$hubSignature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
if (empty($hubSignature) || strpos($hubSignature, 'sha256=') !== 0) {
    http_response_code(401);
    echo json_encode(['error' => 'Missing or invalid X-Hub-Signature-256 header.']);
    exit;
}

$providedHash = substr($hubSignature, 7);
$expectedHash = hash_hmac('sha256', $rawBody, $config['app_secret']);

if (!hash_equals($expectedHash, $providedHash)) {
    http_response_code(401);
    echo json_encode(['error' => 'Webhook signature verification failed.']);
    exit;
}

$payload = json_decode($rawBody, true);
if (!$payload || !isset($payload['entry'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid or empty JSON webhook payload.']);
    exit;
}

$processedEvents = 0;

try {
    foreach ($payload['entry'] as $entry) {
        $changes = $entry['changes'] ?? [];
        foreach ($changes as $change) {
            $value = $change['value'] ?? [];
            $statuses = $value['statuses'] ?? [];

            foreach ($statuses as $st) {
                $msgId = trim($st['id'] ?? '');
                $statusType = strtolower(trim($st['status'] ?? ''));
                $ts = !empty($st['timestamp']) ? date('Y-m-d H:i:s', intval($st['timestamp'])) : date('Y-m-d H:i:s');
                $errors = $st['errors'] ?? [];

                if (empty($msgId) || empty($statusType)) {
                    continue;
                }

                // Check if target log record exists in vsa_student_notification_logs
                $checkStmt = $pdo->prepare("
                    SELECT log_id, status, dispatched_at, delivered_at, read_at 
                    FROM vsa_student_notification_logs 
                    WHERE meta_message_id = ? 
                    LIMIT 1
                ");
                $checkStmt->execute([$msgId]);
                $logRecord = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if (!$logRecord) {
                    continue;
                }

                $logId = intval($logRecord['log_id']);
                $currentStatus = $logRecord['status'];

                // Handle 'sent' - only allowed if currently queued or sent
                if ($statusType === 'sent') {
                    if (in_array($currentStatus, ['queued', 'sent'], true)) {
                        $upd = $pdo->prepare("
                            UPDATE vsa_student_notification_logs
                            SET status = 'sent', dispatched_at = COALESCE(dispatched_at, ?)
                            WHERE log_id = ? AND status IN ('queued', 'sent')
                        ");
                        $upd->execute([$ts, $logId]);
                        if ($upd->rowCount() > 0) {
                            $processedEvents++;
                        }
                    }
                }

                // Handle 'delivered' - only allowed if not already 'read'
                if ($statusType === 'delivered') {
                    if ($currentStatus !== 'read') {
                        $upd = $pdo->prepare("
                            UPDATE vsa_student_notification_logs
                            SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?)
                            WHERE log_id = ? AND status != 'read'
                        ");
                        $upd->execute([$ts, $logId]);
                        if ($upd->rowCount() > 0) {
                            $processedEvents++;
                        }
                    }
                }

                // Handle 'read' - highest delivery status, also populates delivered_at if null
                if ($statusType === 'read') {
                    $upd = $pdo->prepare("
                        UPDATE vsa_student_notification_logs
                        SET status = 'read', read_at = COALESCE(read_at, ?), delivered_at = COALESCE(delivered_at, ?)
                        WHERE log_id = ?
                    ");
                    $upd->execute([$ts, $ts, $logId]);
                    if ($upd->rowCount() > 0) {
                        $processedEvents++;
                    }
                }

                // Handle 'failed' - CRITICAL FIX (WEBHOOK-02):
                // A late failed event must NEVER replace a previously confirmed delivered or read state!
                // Only allowed if current status is queued, sent, or failed.
                if ($statusType === 'failed') {
                    if (!in_array($currentStatus, ['delivered', 'read'], true)) {
                        $errCode = !empty($errors[0]['code']) ? (string)$errors[0]['code'] : 'META_ERROR';
                        $errTitle = !empty($errors[0]['title']) ? $errors[0]['title'] : ($errors[0]['message'] ?? 'Delivery failed');
                        $sanitizedMsg = explainMetaWhatsAppError($errCode, $errTitle);

                        $upd = $pdo->prepare("
                            UPDATE vsa_student_notification_logs
                            SET status = 'failed', error_code = ?, error_message = ?
                            WHERE log_id = ? AND status NOT IN ('delivered', 'read')
                        ");
                        $upd->execute([$errCode, $sanitizedMsg, $logId]);
                        if ($upd->rowCount() > 0) {
                            $processedEvents++;
                        }
                    }
                }
            }
        }
    }

    echo json_encode([
        'success'          => true,
        'message'          => 'EVENT_RECEIVED',
        'events_processed' => $processedEvents
    ]);
    exit;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error recording webhook status: ' . $e->getMessage()]);
    exit;
}
