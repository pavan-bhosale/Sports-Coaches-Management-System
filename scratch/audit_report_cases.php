<?php
require_once __DIR__ . '/../server/db_connect.php';

$reports = [
    'student_overview', 'student_demographics', 'student_enrollment',
    'attendance_summary', 'student_attendance', 'batch_attendance', 'coach_attendance_activity',
    'batch_enrollment', 'batch_attendance_comparison', 'batch_fee_collection',
    'coach_roster', 'coach_batch_assignment',
    'fee_collection', 'monthly_collection_trend', 'payment_methods', 'outstanding_overdue_fees', 'student_fee_history',
    'inventory_status', 'inventory_allocation', 'inventory_movement_audit', 'inventory_loss_deduction',
    'academy_operational_summary', 'monthly_academy_report'
];

echo "========================================================\n";
echo "TESTING ZERO-DATA / IMPOSSIBLE FILTER COMBINATIONS\n";
echo "========================================================\n";

$impossibleFilters = [
    'batch_id'   => 999999,
    'coach_id'   => 999999,
    'student_id' => 999999,
    'start_date' => '2099-01-01',
    'end_date'   => '2099-01-31',
    'month'      => '2099-01',
    'branch'     => 'NONEXISTENT_BRANCH_999',
    'city'       => 'NONEXISTENT_CITY_999',
    'gender'     => 'NonexistentGender',
    'item_id'    => 999999,
    'status'     => 'NONEXISTENT_STATUS'
];

foreach ($reports as $r) {
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$r}&" . http_build_query($impossibleFilters);
    $res = @file_get_contents($url);
    if (!$res) {
        echo "FAIL [{$r}]: HTTP request failed\n";
        continue;
    }
    $json = json_decode($res, true);
    if (!$json || empty($json['success'])) {
        echo "FAIL [{$r}]: Invalid JSON or success != true: " . ($json['error'] ?? 'null') . "\n";
        continue;
    }
    $d = $json['data'] ?? [];
    $isEmpty = !empty($d['empty']);
    $hasHeaders = !empty($d['table_headers']) || !empty($d['table']['columns']);
    $hasMetrics = !empty($d['summary_metrics']);
    $rowsCount = count($d['table']['rows'] ?? []);

    echo sprintf("%-30s | empty: %-5s | metrics: %d | headers: %-5s | rows: %d\n",
        $r,
        $isEmpty ? 'YES' : 'NO',
        count($d['summary_metrics'] ?? []),
        $hasHeaders ? 'YES' : 'NO',
        $rowsCount
    );
}
