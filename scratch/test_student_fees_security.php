<?php
/**
 * Security Audit Test: Student Fees Data Isolation & Forgery Prevention
 * Uses live HTTP requests against localhost to test real PHP sessions and header isolation.
 */

echo "========================================================\n";
echo "VAVA SPORTS — STUDENT FEES SECURITY & ISOLATION TEST\n";
echo "========================================================\n\n";

$passCount = 0;
$failCount = 0;

function runTest($title, $condition, $details = '') {
    global $passCount, $failCount;
    if ($condition) {
        echo "[PASS] " . $title . "\n";
        $passCount++;
    } else {
        echo "[FAIL] " . $title . ($details ? " ($details)" : "") . "\n";
        $failCount++;
    }
}

function httpSetSession($cookieFile, $role, $email, $studentId = 0, $coachId = 0) {
    if (file_exists($cookieFile)) unlink($cookieFile);
    $ch = curl_init('http://localhost/VAVA_sports/scratch/session_helper.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'role' => $role,
        'email' => $email,
        'student_id' => $studentId,
        'coach_id' => $coachId
    ]));
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

function httpGetDashboard($cookieFile, $headers = [], $queryParams = []) {
    $url = 'http://localhost/VAVA_sports/server/dashboard.php';
    if (!empty($queryParams)) {
        $url .= '?' . http_build_query($queryParams);
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
    $httpHeaders = [];
    foreach ($headers as $k => $v) {
        $httpHeaders[] = "$k: $v";
    }
    if (!empty($httpHeaders)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $httpHeaders);
    }
    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $httpCode, 'data' => json_decode($res, true), 'raw' => $res];
}

$cookieStudentA = __DIR__ . '/cookie_student_a.txt';
$cookieStudentB = __DIR__ . '/cookie_student_b.txt';

// ----------------------------------------------------------------------
// TEST 1: Student 3 (Aarav Sharma) session retrieves only Student 3 fees
// ----------------------------------------------------------------------
httpSetSession($cookieStudentA, 'student', 'aarav.sharma@vavasports.local', 3);
$respA = httpGetDashboard($cookieStudentA);

runTest("Student 3 request succeeded with HTTP 200", $respA['code'] === 200);
$dataA = $respA['data'] ?? [];
runTest("Student 3 user.student_id is 3", ($dataA['user']['student_id'] ?? 0) === 3);
runTest("Student 3 has 6 fee records in database", ($dataA['fees']['total_expected'] ?? 0) === 6);
runTest("Student 3 has 1 paid month and 5 due months", ($dataA['fees']['paid_count'] ?? 0) === 1 && ($dataA['fees']['due_count'] ?? 0) === 5);
runTest("Student 3 current month has no fee record -> Not Applicable", ($dataA['fees']['current_month']['status'] ?? '') === 'Not Applicable');

// ----------------------------------------------------------------------
// TEST 2: Student 4 (Avi Patle) session retrieves only Student 4 fees
// ----------------------------------------------------------------------
httpSetSession($cookieStudentB, 'student', 'sureshpatle563@gmail.com', 4);
$respB = httpGetDashboard($cookieStudentB);

runTest("Student 4 request succeeded with HTTP 200", $respB['code'] === 200);
$dataB = $respB['data'] ?? [];
runTest("Student 4 user.student_id is 4", ($dataB['user']['student_id'] ?? 0) === 4);
runTest("Student 4 has distinct payment reference from Student 3", 
    ($dataB['fees']['months'][5]['payment_reference'] ?? '') !== ($dataA['fees']['months'][5]['payment_reference'] ?? '') &&
    ($dataB['fees']['months'][5]['payment_reference'] ?? '') === 'pay_test_881921'
);

// ----------------------------------------------------------------------
// TEST 3: Student 3 attempts query param ?student_id=4
// ----------------------------------------------------------------------
$respTamperQuery = httpGetDashboard($cookieStudentA, [], ['student_id' => '4']);
$dataTamperQ = $respTamperQuery['data'] ?? [];
runTest("Query param ?student_id=4 ignored; still returns Student 3", ($dataTamperQ['user']['student_id'] ?? 0) === 3);
runTest("Payment reference remains Student 3's pay_test_881920", ($dataTamperQ['fees']['months'][5]['payment_reference'] ?? '') === 'pay_test_881920');

// ----------------------------------------------------------------------
// TEST 4: Student 3 attempts to spoof header X-VAVA-Student-ID: 4
// ----------------------------------------------------------------------
$respTamperHeader = httpGetDashboard($cookieStudentA, ['X-VAVA-Student-ID' => '4']);
$dataTamperH = $respTamperHeader['data'] ?? [];
runTest("Header X-VAVA-Student-ID: 4 ignored; still returns Student 3", ($dataTamperH['user']['student_id'] ?? 0) === 3);
runTest("Payment reference remains Student 3's pay_test_881920", ($dataTamperH['fees']['months'][5]['payment_reference'] ?? '') === 'pay_test_881920');

// ----------------------------------------------------------------------
// TEST 5: Student attempts role escalation via X-VAVA-Role: Super Admin
// ----------------------------------------------------------------------
$respEscalate = httpGetDashboard($cookieStudentA, ['X-VAVA-Role' => 'superadmin']);
$dataEscalate = $respEscalate['data'] ?? [];
runTest("Header X-VAVA-Role: superadmin rejected; role remains student", ($dataEscalate['role'] ?? '') === 'student');
runTest("Academy-wide financial data NOT leaked in response", !isset($dataEscalate['kpis']['total_revenue']) && !isset($dataEscalate['financial']));

// ----------------------------------------------------------------------
// TEST 6: Strict Binary Status verification (NO Partial Payment)
// ----------------------------------------------------------------------
$allBinary = true;
foreach ($dataA['fees']['months'] ?? [] as $m) {
    if ($m['status'] !== 'PAID' && $m['status'] !== 'DUE') {
        $allBinary = false;
        break;
    }
}
runTest("All month statuses are strictly PAID or DUE (NO partial payment)", $allBinary);

// ----------------------------------------------------------------------
// TEST 7: Overall count agrees with month grid count
// ----------------------------------------------------------------------
$paidInGrid = 0;
$dueInGrid = 0;
foreach ($dataA['fees']['months'] ?? [] as $m) {
    if ($m['status'] === 'PAID') $paidInGrid++;
    if ($m['status'] === 'DUE') $dueInGrid++;
}
$countsAgree = ($paidInGrid === ($dataA['fees']['paid_count'] ?? -1)) && 
               ($dueInGrid === ($dataA['fees']['due_count'] ?? -1)) &&
               (count($dataA['fees']['months'] ?? []) === ($dataA['fees']['total_expected'] ?? -2));
runTest("Overall status count strictly agrees with month grid items", $countsAgree);

// Cleanup cookie files
if (file_exists($cookieStudentA)) unlink($cookieStudentA);
if (file_exists($cookieStudentB)) unlink($cookieStudentB);

echo "\n========================================================\n";
echo "SUMMARY: {$passCount} Passed, {$failCount} Failed\n";
echo "========================================================\n";
exit($failCount > 0 ? 1 : 0);
