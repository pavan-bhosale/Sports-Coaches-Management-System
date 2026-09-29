<?php
require_once __DIR__ . '/../server/db_connect.php';

$sampleReports = [
    'student_overview',
    'attendance_summary',
    'fee_collection',
    'inventory_status',
    'monthly_academy_report'
];

echo "Testing PDF generation across sample reports...\n";

foreach ($sampleReports as $rep) {
    $postPayload = json_encode(['report' => $rep, 'filters' => []]);
    $ctx = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\n",
            'content' => $postPayload
        ]
    ]);
    $pdf = @file_get_contents("http://localhost/VAVA_sports/server/reports.php?action=download_pdf&report={$rep}", false, $ctx);
    if ($pdf && substr($pdf, 0, 4) === '%PDF') {
        echo "PASS: '{$rep}' PDF generated (" . strlen($pdf) . " bytes)\n";
    } else {
        echo "FAIL: '{$rep}' PDF generation failed: " . substr($pdf, 0, 150) . "\n";
    }
}
