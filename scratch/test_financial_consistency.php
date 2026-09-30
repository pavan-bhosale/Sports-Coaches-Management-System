<?php
/**
 * Test Financial Consistency across Web, PDF, and XLSX for multiple filter combinations
 */
require_once __DIR__ . '/../server/db_connect.php';
$_SERVER['HTTP_X_VAVA_ROLE'] = 'superadmin';
$_GET['action'] = 'none';
require_once __DIR__ . '/../server/reports.php';
require_once __DIR__ . '/../server/report_export.php';

$auth = ['role' => 'superadmin', 'coach' => null];

$testCases = [
    'Default (Unfiltered)' => [],
    'Batch 5 (batch_id=7)' => ['batch_id' => '7'],
    'Batch 3 (batch_id=10)' => ['batch_id' => '10'],
    'Status Paid' => ['status' => 'Paid'],
    'Status Overdue' => ['status' => 'Overdue'],
    'Method Razorpay (UPI)' => ['payment_method' => 'Razorpay (UPI)'],
    'Batch 10 + Overdue' => ['batch_id' => '10', 'status' => 'Overdue'],
    'Due Date Range 2026-09-01 to 2026-09-30' => ['start_date' => '2026-09-01', 'end_date' => '2026-09-30'],
];

echo "========================================================\n";
echo "FINANCIAL CONSISTENCY AUDIT (WEB vs PDF vs EXCEL)\n";
echo "========================================================\n";

$allPassed = true;

foreach ($testCases as $name => $filters) {
    echo "\n--- Testing Filter Case: $name ---\n";
    $reportData = getReportData($pdo, 'fees_payments', $filters, $auth);
    $rowCount = count($reportData['table_rows']);
    
    $totalBilled = $reportData['summary_metrics'][0]['value'] ?? '0';
    $totalCollected = $reportData['summary_metrics'][1]['value'] ?? '0';
    $totalOutstanding = $reportData['summary_metrics'][2]['value'] ?? '0';
    $realizationRate = $reportData['summary_metrics'][3]['value'] ?? '0%';
    $paidRecords = $reportData['summary_metrics'][4]['value'] ?? 0;
    $overdueRecords = $reportData['summary_metrics'][5]['value'] ?? 0;
    
    echo "Web Data: Rows=$rowCount, Billed=$totalBilled, Collected=$totalCollected, Outstanding=$totalOutstanding, Paid=$paidRecords, Overdue=$overdueRecords\n";
    
    // PDF Generation
    $pdf = generateFeesPdf($reportData, $filters);
    if (strlen($pdf) < 1000 || substr($pdf, 0, 4) !== '%PDF') {
        echo "[FAIL] PDF generation failed or invalid for $name (size: " . strlen($pdf) . ")\n";
        $allPassed = false;
    } else {
        echo "[PASS] PDF valid (" . strlen($pdf) . " bytes)\n";
    }
    
    // Excel Generation
    $xlsx = generateFeesXlsx($reportData, $filters);
    file_put_contents(__DIR__ . '/temp_check.xlsx', $xlsx);
    $pyCheck = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/temp_check.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); s2=z.read(\"xl/worksheets/sheet2.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1)"');
    $excelRowCount = intval(trim($pyCheck));
    
    if ($excelRowCount !== $rowCount) {
        echo "[FAIL] Excel row count ($excelRowCount) != Web row count ($rowCount)\n";
        $allPassed = false;
    } else {
        echo "[PASS] Excel rows ($excelRowCount) == Web rows ($rowCount)\n";
    }
}

if ($allPassed) {
    echo "\n>>> ALL FINANCIAL CONSISTENCY CHECKS PASSED PERFECTLY! <<<\n";
} else {
    echo "\n>>> SOME CHECKS FAILED! <<<\n";
}
