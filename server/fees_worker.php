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

// Security: If called via HTTP web server, enforce secret or Super Admin
if (php_sapi_name() !== 'cli') {
    $secret = $_GET['secret'] ?? '';
    $expectedSecret = getenv('WORKER_SECRET') ?: 'vava_scheduler_secret_2026';
    $role = strtolower(trim($_SERVER['HTTP_X_VAVA_ROLE'] ?? $_GET['role'] ?? ''));

    if ($secret !== $expectedSecret && $role !== 'admin' && $role !== 'superadmin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied. Worker secret or Super Admin required.']);
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
