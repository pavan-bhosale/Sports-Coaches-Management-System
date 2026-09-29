<?php
/**
 * Automated Verification Script for Reports Audit
 */

require_once __DIR__ . '/../server/db_connect.php';

echo "============================================================\n";
echo "1. VERIFY OLD REPORT ENDPOINTS ARE INACTIVE\n";
echo "============================================================\n";

$oldReports = [
    'student_overview', 'student_demographics', 'student_enrollment',
    'attendance_summary', 'student_attendance', 'batch_attendance', 'coach_attendance_activity',
    'batch_enrollment', 'batch_attendance_comparison', 'batch_fee_collection',
    'coach_roster', 'coach_batch_assignment',
    'fee_collection', 'monthly_collection_trend', 'payment_methods', 'outstanding_overdue_fees', 'student_fee_history',
    'inventory_status', 'inventory_allocation', 'inventory_movement_audit', 'inventory_loss_deduction',
    'academy_operational_summary', 'monthly_academy_report'
];

$oldInactiveCount = 0;
foreach ($oldReports as $oldR) {
    $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$oldR}";
    $res = file_get_contents($url, false, $ctx);
    $json = json_decode($res, true);
    if ($json && empty($json['success']) && strpos($json['error'] ?? '', 'Invalid or unsupported report type') !== false) {
        $oldInactiveCount++;
    } else {
        echo "WARNING: Old report {$oldR} returned unexpected response: {$res}\n";
    }
}
echo "Old reports correctly rejected: {$oldInactiveCount} / " . count($oldReports) . "\n\n";

echo "============================================================\n";
echo "2. VERIFY NO PDF FUNCTIONALITY REMAINS IN BACKEND\n";
echo "============================================================\n";
$pdfUrl = "http://localhost/VAVA_sports/server/reports.php?action=download_pdf&report=student_batch";
$ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
$pdfRes = file_get_contents($pdfUrl, false, $ctx);
$pdfJson = json_decode($pdfRes, true);
if ($pdfJson && empty($pdfJson['success']) && strpos($pdfJson['error'] ?? '', 'Invalid API action') !== false) {
    echo "PASS: download_pdf action is completely rejected as an invalid action.\n";
} else {
    echo "FAIL: download_pdf was not rejected: {$pdfRes}\n";
}

echo "\n============================================================\n";
echo "3. VERIFY DATA INTEGRITY & DYNAMIC QUERIES ACROSS 5 REPORTS\n";
echo "============================================================\n";

$finalReports = [
    'student_batch',
    'attendance_report',
    'fees_payments',
    'coach_activity',
    'inventory_report'
];

foreach ($finalReports as $r) {
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$r}";
    $res = file_get_contents($url);
    $json = json_decode($res, true);
    if ($json && !empty($json['success'])) {
        $d = $json['data'];
        echo "REPORT: {$d['title']} ({$d['id']})\n";
        echo "  - Period: {$d['period']}\n";
        echo "  - Metrics: " . count($d['summary_metrics']) . " cards\n";
        foreach ($d['summary_metrics'] as $sm) {
            echo "      * {$sm['label']}: {$sm['value']} ({$sm['subtext']})\n";
        }
        echo "  - Table: " . count($d['table_headers']) . " columns, " . count($d['table_rows']) . " rows\n";
        if (!empty($d['batch_summary'])) {
            echo "  - Secondary: Batch Summary with " . count($d['batch_summary']['rows']) . " batches\n";
        }
        if (!empty($d['compact_views'])) {
            echo "  - Secondary: Compact Views present (payment_methods, monthly_trend)\n";
        }
        if (!empty($d['secondary_table'])) {
            echo "  - Secondary: Movement History with " . count($d['secondary_table']['rows']) . " log rows\n";
        }
        echo "  - Chart: " . (!empty($d['chart']) ? 'Rendered' : 'None') . "\n";
        echo "\n";
    } else {
        echo "FAIL: {$r} failed: {$res}\n";
    }
}
