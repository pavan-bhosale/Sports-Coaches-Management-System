<?php
/**
 * VAVA Sports Academy - Background Scheduled Notification Worker
 * 
 * Usage from CLI:
 *   c:\xampp\php\php.exe server/fees_worker.php
 * 
 * Or triggered periodically by Windows Task Scheduler or cron every minute.
 */

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/twilio_config.php';
require_once __DIR__ . '/fees_scheduler_service.php';

// Security: If called via HTTP web server, enforce strong environment-backed secret
$isHttp = (php_sapi_name() !== 'cli' || !empty($_SERVER['REMOTE_ADDR']));
if ($isHttp) {
    // 1. Never allow bypass via role query parameter or client HTTP headers
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $secret = '';
    if (preg_match('/^Bearer\s+(.+)$/i', trim($authHeader), $m)) {
        $secret = trim($m[1]);
    } elseif (!empty($_GET['secret'])) {
        $secret = trim($_GET['secret']);
    } elseif (!empty($_POST['secret'])) {
        $secret = trim($_POST['secret']);
    }

    $expectedSecret = function_exists('getEnvConfig') ? getEnvConfig('WORKER_SECRET') : getenv('WORKER_SECRET');

    // Reject execution if worker secret is not configured in environment
    if (empty($expectedSecret) || strlen($expectedSecret) < 16) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error'   => 'WORKER_MISCONFIGURED',
            'message' => 'Worker secret is not configured or too weak in server environment. HTTP execution is disabled.'
        ]);
        exit;
    }

    // Constant-time comparison to prevent timing attacks
    if (empty($secret) || !hash_equals((string)$expectedSecret, (string)$secret)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error'   => 'ACCESS_DENIED',
            'message' => 'Access denied. A valid worker secret is required to invoke this endpoint via HTTP.'
        ]);
        exit;
    }
}

$result = processDuePaymentNotifications($pdo);

if (php_sapi_name() === 'cli') {
    $count = count($result['processed']);
    echo "[" . date('Y-m-d H:i:s') . "] FEES_WORKER: Processed $count due notification(s).\n";
    foreach ($result['processed'] as $p) {
        echo "  - ID #{$p['notification_id']} ({$p['fee_month']}): Status={$p['status']}, Sent={$p['sent_count']}, Failed={$p['failed_count']}\n";
    }
} else {
    header('Content-Type: application/json');
    echo json_encode($result, JSON_PRETTY_PRINT);
}
