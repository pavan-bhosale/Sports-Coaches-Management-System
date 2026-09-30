<?php
require_once __DIR__ . '/../server/db_connect.php';
$_SERVER['HTTP_X_VAVA_ROLE'] = 'superadmin';
$_GET['action'] = 'none';
require_once __DIR__ . '/../server/reports.php';
require_once __DIR__ . '/../server/report_export.php';

$auth = ['role' => 'superadmin', 'coach' => null];
$filters = [];
$reportData = getReportData($pdo, 'fees_payments', $filters, $auth);

echo "Fetched " . count($reportData['table_rows']) . " fee records.\n";

// Test PDF and XLSX generation for Fees
$pdf = generateFeesPdf($reportData, $filters);
file_put_contents(__DIR__ . '/test_fees.pdf', $pdf);
echo "Generated Fees PDF: " . strlen($pdf) . " bytes\n";

$xlsx = generateFeesXlsx($reportData, $filters);
file_put_contents(__DIR__ . '/test_fees.xlsx', $xlsx);
echo "Generated Fees XLSX: " . strlen($xlsx) . " bytes\n";
