<?php
/**
 * Verification test for the consolidated 5 Reports
 */

require_once __DIR__ . '/../server/db_connect.php';

$reports = [
    'student_batch',
    'attendance_report',
    'fees_payments',
    'coach_activity',
    'inventory_report'
];

echo "========================================================\n";
echo "TESTING 5 CONSOLIDATED CORE REPORTS (DEFAULT & ZERO-DATA)\n";
echo "========================================================\n";

$pass = 0;
$fail = 0;

// 1. Filter Options Test
$foRes = @file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=filter_options');
$foJson = json_decode($foRes, true);
if ($foJson && !empty($foJson['success']) && !empty($foJson['data']['batches'])) {
    echo "PASS: filter_options returned " . count($foJson['data']['batches']) . " batches, " . count($foJson['data']['coaches']) . " coaches.\n";
    $pass++;
} else {
    echo "FAIL: filter_options failed: " . substr($foRes, 0, 150) . "\n";
    $fail++;
}

// 2. Test Default Data for each report
foreach ($reports as $r) {
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$r}";
    $res = @file_get_contents($url);
    $j = json_decode($res, true);
    if ($j && !empty($j['success'])) {
        $d = $j['data'];
        $mCount = count($d['summary_metrics'] ?? []);
        $rCount = count($d['table_rows'] ?? []);
        $hasChart = !empty($d['chart']['labels'] ?? $d['chart']['data']['labels'] ?? []);
        echo sprintf("PASS: %-25s | Metrics: %d | Rows: %d | Chart: %s\n", $r, $mCount, $rCount, $hasChart ? 'YES' : 'NO');
        $pass++;
    } else {
        echo "FAIL: {$r} failed: " . ($j['error'] ?? substr($res, 0, 100)) . "\n";
        $fail++;
    }
}

// 3. Test Impossible / Zero-data Filters
echo "\nTesting Zero-Data / Impossible Filters:\n";
$impossible = [
    'batch_id'   => 999999,
    'coach_id'   => 999999,
    'student_id' => 999999,
    'start_date' => '2099-01-01',
    'end_date'   => '2099-01-31',
    'month'      => '2099-01',
    'status'     => 'NONEXISTENT_STATUS'
];

foreach ($reports as $r) {
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$r}&" . http_build_query($impossible);
    $res = @file_get_contents($url);
    $j = json_decode($res, true);
    if ($j && !empty($j['success']) && !empty($j['data']['empty'])) {
        $mCount = count($j['data']['summary_metrics'] ?? []);
        $rCount = count($j['data']['table_rows'] ?? []);
        echo sprintf("PASS [Empty]: %-17s | Empty: YES | Metrics: %d | Rows: %d\n", $r, $mCount, $rCount);
        $pass++;
    } else {
        echo "FAIL [Empty]: {$r} failed or not flagged empty: " . substr($res, 0, 100) . "\n";
        $fail++;
    }
}

// 4. Test Role Guard: Coach accessing fees_payments or inventory_report
echo "\nTesting Role Guard for Coach:\n";
$coachCtx = stream_context_create([
    'http' => [
        'header' => "X-VAVA-Role: coach\r\nX-VAVA-Coach-ID: 101\r\n",
        'ignore_errors' => true
    ]
]);

$coachRes = @file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=fees_payments', false, $coachCtx);
$coachJson = json_decode($coachRes, true);
if ($coachJson && !empty($coachJson['error']) && strpos($coachJson['error'], 'Access denied') !== false) {
    echo "PASS: Coach blocked from fees_payments (403 Access denied)\n";
    $pass++;
} else {
    echo "FAIL: Coach was not blocked from fees_payments!\n";
    $fail++;
}

$coachInvRes = @file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=inventory_report', false, $coachCtx);
$coachInvJson = json_decode($coachInvRes, true);
if ($coachInvJson && !empty($coachInvJson['error']) && strpos($coachInvJson['error'], 'Access denied') !== false) {
    echo "PASS: Coach blocked from inventory_report (403 Access denied)\n";
    $pass++;
} else {
    echo "FAIL: Coach was not blocked from inventory_report!\n";
    $fail++;
}

echo "========================================================\n";
echo "SUMMARY: {$pass} Passed, {$fail} Failed\n";
echo "========================================================\n";
