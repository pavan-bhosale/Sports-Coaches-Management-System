<?php
/**
 * Test script for Fees & Collections deletion, security, and dynamic recreation
 */

function httpRequest($url, $method = 'GET', $headers = [], $body = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $curlHeaders = [];
    foreach ($headers as $k => $v) {
        $curlHeaders[] = "$k: $v";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);

    if ($body !== null) {
        if (is_array($body)) {
            $body = json_encode($body);
            $curlHeaders[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'code' => $httpCode,
        'body' => $response,
        'json' => json_decode($response, true)
    ];
}

$baseUrl = 'http://localhost/VAVA_sports/server/fees.php';
require_once 'server/db_connect.php';

echo "==================================================\n";
echo "FEES & COLLECTIONS TEST SUITE\n";
echo "==================================================\n";

// --- TEST 14: Attempt delete endpoint as Coach ---
echo "\n--- TEST 14: Reject Coach role ---\n";
$resCoach = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'coach',
    'X-VAVA-Email' => 'chiragdnagvekar@gmail.com'
], ['action' => 'delete_cycle', 'fee_month' => '2026-09-01']);
echo "HTTP Status: " . $resCoach['code'] . "\n";
echo "Response: " . $resCoach['body'] . "\n";
assert($resCoach['code'] === 403, "Coach must receive 403");

// --- TEST 15: Attempt delete endpoint as Student ---
echo "\n--- TEST 15: Reject Student role ---\n";
$resStudent = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'student',
    'X-VAVA-Email' => 'aarav.sharma@vavasports.local'
], ['action' => 'delete_cycle', 'fee_month' => '2026-09-01']);
echo "HTTP Status: " . $resStudent['code'] . "\n";
echo "Response: " . $resStudent['body'] . "\n";
assert($resStudent['code'] === 403, "Student must receive 403");

// Baseline database counts
$studentsCountBefore = intval($pdo->query("SELECT COUNT(*) FROM vsa_students")->fetchColumn());
$batchesCountBefore = intval($pdo->query("SELECT COUNT(*) FROM vsa_batches")->fetchColumn());
$coachesCountBefore = intval($pdo->query("SELECT COUNT(*) FROM vsa_coaches")->fetchColumn());
$attendanceCountBefore = intval($pdo->query("SELECT COUNT(*) FROM vsa_attendance")->fetchColumn());
echo "\nBaseline record counts:\nStudents: $studentsCountBefore, Batches: $batchesCountBefore, Coaches: $coachesCountBefore, Attendance: $attendanceCountBefore\n";

// --- TEST 11: Create September 2035 ---
echo "\n--- TEST 11: Create September 2035 cycle ---\n";
$resCreate2035 = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'admin'
], ['action' => 'start_payment_cycle', 'month' => 'September', 'year' => '2035']);
echo "HTTP Status: " . $resCreate2035['code'] . "\n";
echo "Records created: " . ($resCreate2035['json']['payment_records_created'] ?? 'none') . "\n";
assert($resCreate2035['code'] === 200, "Should create September 2035");

// Check DB for 2035-09-01
$cnt2035 = intval($pdo->query("SELECT COUNT(*) FROM vsa_student_fees WHERE fee_month = '2035-09-01'")->fetchColumn());
echo "Rows in vsa_student_fees for 2035-09-01: $cnt2035\n";
assert($cnt2035 > 0, "Fee rows must exist for 2035-09-01");

// --- TEST 12: Try creating September 2035 again (Duplicate check) ---
echo "\n--- TEST 12: Duplicate check for September 2035 ---\n";
$resDupCheck = httpRequest($baseUrl . '?action=check_cycle&month=September&year=2035', 'GET', [
    'X-VAVA-Role' => 'admin'
]);
echo "Check Cycle Response: " . $resDupCheck['body'] . "\n";
assert($resDupCheck['json']['exists'] === true, "Cycle 2035 should exist");

$resCreate2035Dup = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'admin'
], ['action' => 'start_payment_cycle', 'month' => 'September', 'year' => '2035']);
echo "Duplicate Start HTTP Status: " . $resCreate2035Dup['code'] . "\n";
echo "Duplicate Start Response: " . $resCreate2035Dup['body'] . "\n";
assert($resCreate2035Dup['code'] === 409, "Duplicate cycle must be rejected with 409");

// Verify available months includes 2035-09-01
$resGetFees = httpRequest($baseUrl . '?action=get_fees', 'GET', ['X-VAVA-Role' => 'admin']);
$availableMonths = array_column($resGetFees['json']['available_months'], 'date');
echo "Available months contains 2035-09-01: " . (in_array('2035-09-01', $availableMonths) ? 'YES' : 'NO') . "\n";
assert(in_array('2035-09-01', $availableMonths), "2035-09-01 must be in available months");

// --- TEST 6: Delete September 2035 via delete_cycle ---
echo "\n--- TEST 6: Delete September 2035 ---\n";
$resDelete = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'admin'
], ['action' => 'delete_cycle', 'fee_month' => '2035-09-01']);
echo "Delete HTTP Status: " . $resDelete['code'] . "\n";
echo "Delete Response: " . $resDelete['body'] . "\n";
assert($resDelete['code'] === 200, "Delete must return 200");
assert($resDelete['json']['success'] === true, "Delete must report success");
assert($resDelete['json']['deleted_count'] === $cnt2035, "Deleted count must match row count");
assert($resDelete['json']['fee_month'] === '2035-09-01', "Deleted fee_month must match");

// Verify DB has 0 rows for 2035-09-01
$cnt2035After = intval($pdo->query("SELECT COUNT(*) FROM vsa_student_fees WHERE fee_month = '2035-09-01'")->fetchColumn());
echo "Rows remaining for 2035-09-01: $cnt2035After\n";
assert($cnt2035After === 0, "No records must remain for 2035-09-01");

// Verify get_fees no longer lists 2035-09-01
$resGetFeesAfter = httpRequest($baseUrl . '?action=get_fees', 'GET', ['X-VAVA-Role' => 'admin']);
$availableMonthsAfter = array_column($resGetFeesAfter['json']['available_months'], 'date');
echo "Available months still contains 2035-09-01: " . (in_array('2035-09-01', $availableMonthsAfter) ? 'YES' : 'NO') . "\n";
assert(!in_array('2035-09-01', $availableMonthsAfter), "2035-09-01 must no longer be in available months");

// --- TEST 10 & 12: Recreate September 2035 ---
echo "\n--- TEST 10 & 12: Recreate September 2035 after deletion ---\n";
$resReCheck = httpRequest($baseUrl . '?action=check_cycle&month=September&year=2035', 'GET', [
    'X-VAVA-Role' => 'admin'
]);
echo "Check cycle after deletion exists: " . ($resReCheck['json']['exists'] ? 'true' : 'false') . "\n";
assert($resReCheck['json']['exists'] === false, "Cycle must not exist after deletion");

$resRecreate = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'admin'
], ['action' => 'start_payment_cycle', 'month' => 'September', 'year' => '2035']);
echo "Recreate HTTP Status: " . $resRecreate['code'] . "\n";
assert($resRecreate['code'] === 200, "Recreation must succeed");

// Clean up September 2035 test records
$resCleanup = httpRequest($baseUrl, 'POST', [
    'X-VAVA-Role' => 'admin'
], ['action' => 'delete_cycle', 'fee_month' => '2035-09-01']);
echo "Cleanup test cycle 2035: deleted " . $resCleanup['json']['deleted_count'] . " rows\n";

// --- TEST 13: Integrity check ---
echo "\n--- TEST 13: Verify other tables are untouched ---\n";
$studentsCountAfter = intval($pdo->query("SELECT COUNT(*) FROM vsa_students")->fetchColumn());
$batchesCountAfter = intval($pdo->query("SELECT COUNT(*) FROM vsa_batches")->fetchColumn());
$coachesCountAfter = intval($pdo->query("SELECT COUNT(*) FROM vsa_coaches")->fetchColumn());
$attendanceCountAfter = intval($pdo->query("SELECT COUNT(*) FROM vsa_attendance")->fetchColumn());

echo "Students: $studentsCountAfter (was $studentsCountBefore)\n";
echo "Batches: $batchesCountAfter (was $batchesCountBefore)\n";
echo "Coaches: $coachesCountAfter (was $coachesCountBefore)\n";
echo "Attendance: $attendanceCountAfter (was $attendanceCountBefore)\n";

assert($studentsCountAfter === $studentsCountBefore, "Students count must not change");
assert($batchesCountAfter === $batchesCountBefore, "Batches count must not change");
assert($coachesCountAfter === $coachesCountBefore, "Coaches count must not change");
assert($attendanceCountAfter === $attendanceCountBefore, "Attendance count must not change");

echo "\nALL API TESTS PASSED SUCCESSFULLY!\n";
