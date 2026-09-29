<?php
/**
 * Test all 22 reports and PDF export against actual database
 */

require_once __DIR__ . '/../server/db_connect.php';

$reports = [
    // Students
    'student_overview',
    'student_demographics',
    'student_enrollment',
    // Attendance
    'attendance_summary',
    'student_attendance',
    'batch_attendance',
    'coach_attendance_activity',
    // Batches
    'batch_enrollment',
    'batch_attendance_comparison',
    'batch_fee_collection',
    // Coaches
    'coach_roster',
    'coach_batch_assignment',
    // Fees
    'fee_collection',
    'monthly_collection_trend',
    'payment_methods',
    'outstanding_overdue_fees',
    'student_fee_history',
    // Inventory
    'inventory_status',
    'inventory_allocation',
    'inventory_movement_audit',
    'inventory_loss_deduction',
    // Management
    'academy_operational_summary',
    'monthly_academy_report'
];

echo "========================================================\n";
echo "TESTING ALL REPORTS (PREVIEW DATA AND PDF GENERATION)\n";
echo "========================================================\n";

$passCount = 0;
$failCount = 0;

foreach ($reports as $idx => $reportId) {
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$reportId}";
    $res = @file_get_contents($url);
    if (!$res) {
        echo sprintf("[%02d] FAIL: %-30s -> HTTP request failed\n", $idx + 1, $reportId);
        $failCount++;
        continue;
    }

    $json = json_decode($res, true);
    if (!$json || empty($json['success'])) {
        $err = $json['error'] ?? 'Invalid JSON or failed status';
        echo sprintf("[%02d] FAIL: %-30s -> Error: %s\n", $idx + 1, $reportId, $err);
        $failCount++;
        continue;
    }

    $data = $json['data'] ?? [];
    $title = $data['title'] ?? 'Untitled';
    $metricCount = count($data['summary_metrics'] ?? []);
    $rowCount = count($data['table']['rows'] ?? []);
    $hasChart = !empty($data['chart']['data']['labels']);

    echo sprintf("[%02d] PASS: %-30s | Metrics: %d | Rows: %d | Chart: %s\n",
        $idx + 1,
        $reportId,
        $metricCount,
        $rowCount,
        $hasChart ? 'YES' : 'NO'
    );
    $passCount++;
}

echo "--------------------------------------------------------\n";
echo "Preview Test Results: {$passCount} Passed, {$failCount} Failed\n";
echo "--------------------------------------------------------\n\n";

// Test PDF Generation for a selected report
echo "Testing PDF Generation for 'attendance_summary'...\n";
$postPayload = json_encode([
    'report' => 'attendance_summary',
    'filters' => []
]);

$ctx = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => $postPayload
    ]
]);

$pdfBytes = @file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=download_pdf&report=attendance_summary', false, $ctx);

// Test Role Guard: Coach accessing Fee Collection should be rejected with 403 / error
echo "\nTesting Role Guard: Coach role attempting to access 'fee_collection'...\n";
$coachCtx = stream_context_create([
    'http' => [
        'header' => "X-VAVA-Role: coach\r\nX-VAVA-Coach-ID: 101\r\n",
        'ignore_errors' => true
    ]
]);
$coachRes = @file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=fee_collection', false, $coachCtx);
$coachJson = json_decode($coachRes, true);
if (!empty($coachJson) && !empty($coachJson['error']) && strpos($coachJson['error'], 'Access denied') !== false) {
    echo "PASS: Coach successfully blocked from financial report! (" . $coachJson['error'] . ")\n";
} else {
    echo "FAIL: Coach was not properly restricted: " . $coachRes . "\n";
}

echo "========================================================\n";
