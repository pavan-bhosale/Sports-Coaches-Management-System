<?php
/**
 * Automated Verification Suite for Scheduled WhatsApp Notifications & Worker
 * 
 * Tests:
 * 1. Schedule validation helper (empty, past, duplicate, invalid, valid)
 * 2. Start payment cycle with schedules: inserts fees and schedules, NO immediate dispatch
 * 3. Fetch cycle schedules endpoint
 * 4. Background worker processing: future ignored, due notification locked and processed
 * 5. Worker idempotence: no re-processing of already-sent notifications
 * 6. Deletion cascade: deleting cycle removes fees and schedules
 * 7. Re-creation of cycle: allows fresh creation with fresh schedules
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/../server/db_connect.php';
require_once __DIR__ . '/../server/fees_scheduler_service.php';

// $pdo is provided by db_connect.php

$testsPassed = 0;
$testsFailed = 0;

function assertTest($description, $condition, $details = '') {
    global $testsPassed, $testsFailed;
    if ($condition) {
        echo " [PASS] $description\n";
        $testsPassed++;
    } else {
        echo " [FAIL] $description" . ($details ? " - $details" : "") . "\n";
        $testsFailed++;
    }
}

echo "========================================================\n";
echo "VAVA SPORTS: SCHEDULED NOTIFICATIONS VERIFICATION SUITE\n";
echo "Current Time (IST): " . date('Y-m-d H:i:s') . "\n";
echo "========================================================\n\n";

// --- TEST 1: Schedule Validation Function ---
echo "--- 1. Schedule Validation Logic ---\n";

// 1.1 Empty schedules
$r1 = validateNotificationSchedules([]);
assertTest("Rejects empty schedules array", $r1['valid'] === false && $r1['error'] === 'At least one notification schedule is required.', "Got: " . ($r1['error'] ?? ''));

// 1.2 Invalid format / missing date
$r2 = validateNotificationSchedules([['time' => '10:00']]);
assertTest("Rejects missing date", $r2['valid'] === false && strpos($r2['error'], 'missing date') !== false, "Got: " . ($r2['error'] ?? ''));

// 1.3 Missing time
$r3 = validateNotificationSchedules([['date' => '2026-10-01']]);
assertTest("Rejects missing time", $r3['valid'] === false && strpos($r3['error'], 'missing date or time') !== false, "Got: " . ($r3['error'] ?? ''));

// 1.4 Past date/time in IST
$yesterday = date('Y-m-d', strtotime('-1 day'));
$r4 = validateNotificationSchedules([['date' => $yesterday, 'time' => '10:00']]);
assertTest("Rejects past date/time", $r4['valid'] === false && strpos($r4['error'], 'must be in the future') !== false, "Got: " . ($r4['error'] ?? ''));

// 1.5 Duplicate dates/times
$futureDate = date('Y-m-d', strtotime('+5 days'));
$r5 = validateNotificationSchedules([
    ['date' => $futureDate, 'time' => '10:00'],
    ['date' => $futureDate, 'time' => '10:00']
]);
assertTest("Rejects duplicate schedule entries", $r5['valid'] === false && strpos($r5['error'], 'Duplicate notification') !== false, "Got: " . ($r5['error'] ?? ''));

// 1.6 Valid future schedules
$schedA = date('Y-m-d', strtotime('+3 days'));
$schedB = date('Y-m-d', strtotime('+7 days'));
$r6 = validateNotificationSchedules([
    ['date' => $schedA, 'time' => '09:00'],
    ['date' => $schedB, 'time' => '18:00']
]);
assertTest("Accepts valid future schedules", $r6['valid'] === true && count($r6['schedules']) === 2, "Got error: " . ($r6['error'] ?? ''));

// Fetch genuine superadmin email
$adminEmail = $pdo->query("SELECT admin_email FROM vsa_superadmin LIMIT 1")->fetchColumn();
echo "Super Admin Email detected: " . ($adminEmail ?: 'None') . "\n";

$authHeaders = [
    'Content-Type: application/json',
    'X-VAVA-Role: superadmin',
    'X-VAVA-Email: ' . ($adminEmail ?: 'admin')
];

// --- TEST 2: Payment Cycle Creation with Schedules (via API/Controller) ---
echo "\n--- 2. Payment Cycle Creation with Schedules ---\n";

$testMonth = 'August';
$testYear = '2031';
$testFeeMonth = '2031-08-01';

// Cleanup if exists from previous test
$pdo->prepare("DELETE FROM vsa_payment_notifications WHERE fee_month = ?")->execute([$testFeeMonth]);
$pdo->prepare("DELETE FROM vsa_student_fees WHERE fee_month = ?")->execute([$testFeeMonth]);

$future1 = date('Y-m-d', strtotime('+2 days'));
$future2 = date('Y-m-d', strtotime('+9 days'));
$postPayload = json_encode([
    'action' => 'start_payment_cycle',
    'month' => $testMonth,
    'year' => $testYear,
    'schedules' => [
        ['date' => $future1, 'time' => '10:00'],
        ['date' => $future2, 'time' => '15:30']
    ]
]);

// Execute via curl to test true HTTP lifecycle and header handling
$ch = curl_init('http://localhost/VAVA_sports/server/fees.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postPayload);
curl_setopt($ch, CURLOPT_HTTPHEADER, $authHeaders);
$responseRaw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$resp = json_decode($responseRaw, true);
assertTest("start_payment_cycle returns HTTP 200", $httpCode === 200, "HTTP $httpCode, Resp: $responseRaw");
assertTest("Response reports success", !empty($resp['success']), "Resp: " . print_r($resp, true));
assertTest("Response reports 2 schedules created", isset($resp['schedules_count']) && $resp['schedules_count'] === 2, "Count: " . ($resp['schedules_count'] ?? 'none'));

// Verify database records
$stmtFees = $pdo->prepare("SELECT COUNT(*) FROM vsa_student_fees WHERE fee_month = ?");
$stmtFees->execute([$testFeeMonth]);
$feesCount = (int)$stmtFees->fetchColumn();
assertTest("Fee records created in vsa_student_fees", $feesCount > 0, "Found $feesCount fee records");

$stmtSched = $pdo->prepare("SELECT * FROM vsa_payment_notifications WHERE fee_month = ? ORDER BY scheduled_at ASC");
$stmtSched->execute([$testFeeMonth]);
$savedSchedules = $stmtSched->fetchAll(PDO::FETCH_ASSOC);
assertTest("Exactly 2 notification rows saved in vsa_payment_notifications", count($savedSchedules) === 2);
assertTest("Schedules have status 'Scheduled'", isset($savedSchedules[0]) && $savedSchedules[0]['status'] === 'Scheduled' && isset($savedSchedules[1]) && $savedSchedules[1]['status'] === 'Scheduled');
assertTest("First schedule time matches", isset($savedSchedules[0]) && $savedSchedules[0]['scheduled_at'] === "$future1 10:00:00");
assertTest("Second schedule time matches", isset($savedSchedules[1]) && $savedSchedules[1]['scheduled_at'] === "$future2 15:30:00");

// --- TEST 3: Fetch Cycle Schedules Endpoint ---
echo "\n--- 3. Fetch Cycle Schedules API ---\n";

$ch2 = curl_init("http://localhost/VAVA_sports/server/fees.php?action=get_cycle_schedules&month=" . urlencode($testFeeMonth));
curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch2, CURLOPT_HTTPHEADER, $authHeaders);
$resp2Raw = curl_exec($ch2);
$http2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
curl_close($ch2);

$resp2 = json_decode($resp2Raw, true);
assertTest("get_cycle_schedules returns HTTP 200", $http2 === 200);
assertTest("get_cycle_schedules returns 2 schedules", isset($resp2['schedules']) && count($resp2['schedules']) === 2);

// --- TEST 4: Background Worker Processing ---
echo "\n--- 4. Background Worker Execution ---\n";

// 4.1 Run worker when schedules are in the future -> 0 processed
$workerResult1 = processDuePaymentNotifications($pdo);
assertTest("Worker processes 0 due notifications when all are in the future", count($workerResult1['processed']) === 0, "Processed: " . count($workerResult1['processed']));

// 4.2 Make schedule #1 due now (set scheduled_at to 1 minute ago)
$pastTime = date('Y-m-d H:i:s', strtotime('-1 minute'));
$firstId = $savedSchedules[0]['notification_id'];
$pdo->prepare("UPDATE vsa_payment_notifications SET scheduled_at = ? WHERE notification_id = ?")->execute([$pastTime, $firstId]);

// 4.3 Run worker again -> schedule #1 must be processed
$workerResult2 = processDuePaymentNotifications($pdo);
assertTest("Worker processed the due notification", count($workerResult2['processed']) === 1, "Processed: " . count($workerResult2['processed']));

// Check schedule #1 status in DB
$stmtFirst = $pdo->prepare("SELECT * FROM vsa_payment_notifications WHERE notification_id = ?");
$stmtFirst->execute([$firstId]);
$firstUpdated = $stmtFirst->fetch(PDO::FETCH_ASSOC);
assertTest("Schedule status is no longer 'Scheduled'", $firstUpdated['status'] !== 'Scheduled', "Status: " . $firstUpdated['status']);
assertTest("Schedule has sent_at timestamp", !empty($firstUpdated['sent_at']), "Sent at: " . ($firstUpdated['sent_at'] ?? 'none'));
assertTest("Schedule recorded student count", $firstUpdated['total_students'] >= 0, "Students: " . $firstUpdated['total_students']);

// Schedule #2 should still be Scheduled
$secondId = $savedSchedules[1]['notification_id'];
$stmtSecond = $pdo->prepare("SELECT status FROM vsa_payment_notifications WHERE notification_id = ?");
$stmtSecond->execute([$secondId]);
$secondStatus = $stmtSecond->fetchColumn();
assertTest("Future schedule #2 remains 'Scheduled'", $secondStatus === 'Scheduled');

// --- TEST 5: Worker Idempotence ---
echo "\n--- 5. Worker Idempotence ---\n";
$workerResult3 = processDuePaymentNotifications($pdo);
assertTest("Worker does not re-process already processed notification", count($workerResult3['processed']) === 0, "Processed: " . count($workerResult3['processed']));

// --- TEST 6: Payment Cycle Deletion Cascade ---
echo "\n--- 6. Deletion Cascade ---\n";

$deletePayload = json_encode([
    'action' => 'delete_cycle',
    'month' => $testFeeMonth
]);
$chDel = curl_init('http://localhost/VAVA_sports/server/fees.php');
curl_setopt($chDel, CURLOPT_RETURNTRANSFER, true);
curl_setopt($chDel, CURLOPT_POST, true);
curl_setopt($chDel, CURLOPT_POSTFIELDS, $deletePayload);
curl_setopt($chDel, CURLOPT_HTTPHEADER, $authHeaders);
$delRespRaw = curl_exec($chDel);
$delHttp = curl_getinfo($chDel, CURLINFO_HTTP_CODE);
curl_close($chDel);

$delResp = json_decode($delRespRaw, true);
assertTest("delete_cycle returns HTTP 200", $delHttp === 200);
assertTest("delete_cycle reports success", !empty($delResp['success']));

// Verify both tables are clean for this cycle
$stmtCheckFees = $pdo->prepare("SELECT COUNT(*) FROM vsa_student_fees WHERE fee_month = ?");
$stmtCheckFees->execute([$testFeeMonth]);
$feesRemaining = (int)$stmtCheckFees->fetchColumn();
assertTest("All fee records deleted for cycle", $feesRemaining === 0);

$stmtCheckSched = $pdo->prepare("SELECT COUNT(*) FROM vsa_payment_notifications WHERE fee_month = ?");
$stmtCheckSched->execute([$testFeeMonth]);
$schedRemaining = (int)$stmtCheckSched->fetchColumn();
assertTest("All schedule records deleted for cycle", $schedRemaining === 0);

// --- TEST 7: Re-creating Deleted Cycle ---
echo "\n--- 7. Re-creating Deleted Payment Cycle ---\n";

$recreatePayload = json_encode([
    'action' => 'start_payment_cycle',
    'month' => $testMonth,
    'year' => $testYear,
    'schedules' => [
        ['date' => $future1, 'time' => '11:00']
    ]
]);
$chRe = curl_init('http://localhost/VAVA_sports/server/fees.php');
curl_setopt($chRe, CURLOPT_RETURNTRANSFER, true);
curl_setopt($chRe, CURLOPT_POST, true);
curl_setopt($chRe, CURLOPT_POSTFIELDS, $recreatePayload);
curl_setopt($chRe, CURLOPT_HTTPHEADER, $authHeaders);
$reRespRaw = curl_exec($chRe);
$reHttp = curl_getinfo($chRe, CURLINFO_HTTP_CODE);
curl_close($chRe);

$reResp = json_decode($reRespRaw, true);
assertTest("Re-creating deleted cycle returns HTTP 200", $reHttp === 200);
assertTest("Re-created cycle reports 1 fresh schedule", isset($reResp['schedules_count']) && $reResp['schedules_count'] === 1);

// Final Cleanup of test month
$pdo->prepare("DELETE FROM vsa_payment_notifications WHERE fee_month = ?")->execute([$testFeeMonth]);
$pdo->prepare("DELETE FROM vsa_student_fees WHERE fee_month = ?")->execute([$testFeeMonth]);

echo "\n========================================================\n";
echo "RESULTS: $testsPassed PASSED, $testsFailed FAILED\n";
echo "========================================================\n";

if ($testsFailed > 0) {
    exit(1);
}
exit(0);
