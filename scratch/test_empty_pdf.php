<?php
require_once __DIR__ . '/../server/db_connect.php';

$impossibleFilters = [
    'batch_id'   => 999999,
    'coach_id'   => 999999,
    'student_id' => 999999,
    'start_date' => '2099-01-01',
    'end_date'   => '2099-01-31',
    'month'      => '2099-01',
    'status'     => 'NONEXISTENT_STATUS'
];

$postPayload = json_encode([
    'report'  => 'student_overview',
    'filters' => $impossibleFilters
]);

$ctx = stream_context_create([
    'http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/json\r\n",
        'content' => $postPayload
    ]
]);

$pdf = @file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=download_pdf&report=student_overview', false, $ctx);

if ($pdf && substr($pdf, 0, 4) === '%PDF') {
    echo "PASS: Empty data PDF generated successfully! Size: " . strlen($pdf) . " bytes\n";
} else {
    echo "FAIL: Empty data PDF generation failed: " . substr($pdf, 0, 200) . "\n";
}
