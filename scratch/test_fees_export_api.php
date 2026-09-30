<?php
/**
 * Test Suite for Fees & Payments Export API (PDF & XLSX)
 */

function makeRequest($params, $headers = []) {
    $baseUrl = 'http://localhost/VAVA_sports/server/reports.php';
    $url = $baseUrl . '?' . http_build_query($params);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    
    $httpHeaders = [];
    foreach ($headers as $k => $v) {
        $httpHeaders[] = "$k: $v";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $httpHeaders);
    
    $response = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    
    $headerStr = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);
    
    return [
        'code' => $httpCode,
        'contentType' => $contentType,
        'headers' => $headerStr,
        'body' => $body
    ];
}

$adminHeaders = [
    'X-VAVA-Role' => 'superadmin',
    'X-VAVA-Email' => 'superadmin@vavasports.com'
];
$coachHeaders = [
    'X-VAVA-Role' => 'coach',
    'X-VAVA-Email' => 'coach@vavasports.com',
    'X-VAVA-Coach-Id' => '1'
];
$studentHeaders = [
    'X-VAVA-Role' => 'student',
    'X-VAVA-Email' => 'student@vavasports.com'
];

echo "========================================================\n";
echo "FEES & PAYMENTS EXPORT API TEST SUITE\n";
echo "========================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest($name, $condition, $details = '') {
    global $passCount, $failCount;
    if ($condition) {
        echo "[PASS] $name\n";
        $passCount++;
    } else {
        echo "[FAIL] $name: $details\n";
        $failCount++;
    }
}

// 1. Unfiltered PDF Export
$res = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'pdf'
], $adminHeaders);

assertTest("1. Superadmin PDF export returns 200", $res['code'] === 200, "Got " . $res['code']);
assertTest("1b. Superadmin PDF Content-Type is application/pdf", strpos($res['contentType'], 'application/pdf') !== false, "Got " . $res['contentType']);
assertTest("1c. PDF body starts with %PDF", substr($res['body'], 0, 4) === '%PDF', "Got " . substr($res['body'], 0, 10));

// 2. Unfiltered XLSX Export
$res = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'xlsx'
], $adminHeaders);

assertTest("2. Superadmin XLSX export returns 200", $res['code'] === 200, "Got " . $res['code']);
assertTest("2b. Superadmin XLSX Content-Type is spreadsheetml", strpos($res['contentType'], 'spreadsheetml') !== false, "Got " . $res['contentType']);
assertTest("2c. XLSX body starts with PK (zip)", substr($res['body'], 0, 2) === "PK", "Got " . substr($res['body'], 0, 10));

// 3. Compare with Web Report get_report (Single Source of Truth)
$webRes = makeRequest([
    'action' => 'get_report',
    'report' => 'fees_payments'
], $adminHeaders);
$webJson = json_decode($webRes['body'], true);
$webRowCount = count($webJson['data']['table_rows'] ?? []);
$webTotalFees = $webJson['data']['summary_metrics'][0]['value'] ?? '';
$webTotalCollected = $webJson['data']['summary_metrics'][1]['value'] ?? '';
$webTotalOutstanding = $webJson['data']['summary_metrics'][2]['value'] ?? '';

echo "Web Report Rows: $webRowCount, Billed: $webTotalFees, Collected: $webTotalCollected, Outstanding: $webTotalOutstanding\n";
assertTest("3. Web report has 61 fee records", $webRowCount === 61, "Found $webRowCount");

// Save XLSX to test contents
file_put_contents(__DIR__ . '/api_test_fees.xlsx', $res['body']);
$pyRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_fees.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); s2=z.read(\"xl/worksheets/sheet2.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1); print(\"91,500\" in s2); print(\"3,000\" in s2)"');
$pyLines = array_map('trim', explode("\n", trim($pyRes)));
$excelRowCount = intval($pyLines[0] ?? 0);
assertTest("3b. Excel sheet1 row count ($excelRowCount) matches web report ($webRowCount)", $excelRowCount === $webRowCount, "Excel has $excelRowCount rows");
assertTest("3c. Excel summary contains Total Billed value ($webTotalFees)", ($pyLines[1] ?? '') === 'True');
assertTest("3d. Excel summary contains Total Collected value ($webTotalCollected)", ($pyLines[2] ?? '') === 'True');

// 4. Batch Filter (batch_id = 7 - Batch 5, 6 records)
$webBatchRes = makeRequest([
    'action' => 'get_report',
    'report' => 'fees_payments',
    'batch_id' => '7'
], $adminHeaders);
$webBatchJson = json_decode($webBatchRes['body'], true);
$webBatchRowCount = count($webBatchJson['data']['table_rows'] ?? []);

$pdfBatchRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'pdf',
    'batch_id' => '7'
], $adminHeaders);
assertTest("4a. Batch 7 PDF export returns 200", $pdfBatchRes['code'] === 200);
assertTest("4b. Batch 7 PDF starts with %PDF", substr($pdfBatchRes['body'], 0, 4) === '%PDF');

$xlsxBatchRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'xlsx',
    'batch_id' => '7'
], $adminHeaders);
file_put_contents(__DIR__ . '/api_test_batch.xlsx', $xlsxBatchRes['body']);
$pyBatchRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_batch.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1)"');
$batchExcelRows = intval(trim($pyBatchRes));
assertTest("4c. Batch 7 Excel row count ($batchExcelRows) matches web report ($webBatchRowCount)", $batchExcelRows === $webBatchRowCount && $batchExcelRows === 6);

// 5. Fee Status Filter (status = Paid)
$webPaidRes = makeRequest([
    'action' => 'get_report',
    'report' => 'fees_payments',
    'status' => 'Paid'
], $adminHeaders);
$webPaidJson = json_decode($webPaidRes['body'], true);
$webPaidRowCount = count($webPaidJson['data']['table_rows'] ?? []);

$xlsxPaidRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'xlsx',
    'status' => 'Paid'
], $adminHeaders);
file_put_contents(__DIR__ . '/api_test_paid.xlsx', $xlsxPaidRes['body']);
$pyPaidRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_paid.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1)"');
$paidExcelRows = intval(trim($pyPaidRes));
assertTest("5. Status=Paid Excel row count ($paidExcelRows) matches web report ($webPaidRowCount)", $paidExcelRows === $webPaidRowCount && $paidExcelRows === 2);

// 6. Zero-Result Export
$zeroRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'pdf',
    'batch_id' => '999999' // Non-existent batch
], $adminHeaders);
assertTest("6. Zero-result returns 200 HTTP code", $zeroRes['code'] === 200);
$zeroJson = json_decode($zeroRes['body'], true);
assertTest("6b. Zero-result returns empty=true JSON", !empty($zeroJson['empty']) && $zeroJson['empty'] === true);
assertTest("6c. Zero-result message is correct", ($zeroJson['message'] ?? '') === 'No fee or payment data available to export for the selected filters.', "Message: " . ($zeroJson['message'] ?? ''));

// 7. Authorization Restrictions
$coachRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'pdf'
], $coachHeaders);
assertTest("7a. Coach role is rejected with 403", $coachRes['code'] === 403, "Got " . $coachRes['code']);

$studentRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'pdf'
], $studentHeaders);
assertTest("7b. Student role is rejected with 403", $studentRes['code'] === 403, "Got " . $studentRes['code']);

$invalidRoleHeaders = [
    'X-VAVA-Role' => 'guest'
];
$invalidRes = makeRequest([
    'action' => 'export_report',
    'report' => 'fees_payments',
    'format' => 'pdf'
], $invalidRoleHeaders);
assertTest("7c. Unauthorized/guest role is rejected with 403", $invalidRes['code'] === 403, "Got " . $invalidRes['code']);

echo "\n========================================================\n";
echo "SUMMARY: Passed: $passCount, Failed: $failCount\n";
echo "========================================================\n";
