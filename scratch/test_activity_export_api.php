<?php
/**
 * Test Suite for Activity Report Export API (PDF & XLSX)
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
    'X-VAVA-Email' => 'chirag.nagvekar@vavasports.com',
    'X-VAVA-Coach-Id' => '1'
];
$studentHeaders = [
    'X-VAVA-Role' => 'student',
    'X-VAVA-Email' => 'student@vavasports.com'
];

echo "========================================================\n";
echo "ACTIVITY REPORT EXPORT API TEST SUITE\n";
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
    'report' => 'activity_report',
    'format' => 'pdf'
], $adminHeaders);

assertTest("1a. Superadmin Activity PDF export returns 200", $res['code'] === 200, "Got " . $res['code']);
assertTest("1b. Activity PDF Content-Type is application/pdf", strpos($res['contentType'], 'application/pdf') !== false, "Got " . $res['contentType']);
assertTest("1c. Activity PDF body starts with %PDF", substr($res['body'], 0, 4) === '%PDF', "Got " . substr($res['body'], 0, 10));

// 2. Unfiltered XLSX Export
$res = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'xlsx'
], $adminHeaders);

assertTest("2a. Superadmin Activity XLSX export returns 200", $res['code'] === 200, "Got " . $res['code']);
assertTest("2b. Activity XLSX Content-Type is spreadsheetml", strpos($res['contentType'], 'spreadsheetml') !== false, "Got " . $res['contentType']);
assertTest("2c. Activity XLSX body starts with PK (zip)", substr($res['body'], 0, 2) === "PK", "Got " . substr($res['body'], 0, 10));

// 3. Compare with Web Report get_report (Single Source of Truth)
$webRes = makeRequest([
    'action' => 'get_report',
    'report' => 'activity_report'
], $adminHeaders);
$webJson = json_decode($webRes['body'], true);
$webRowCount = count($webJson['data']['table_rows'] ?? []);
$webTotalActivities = $webJson['data']['summary_metrics'][0]['value'] ?? 0;

echo "Web Report Total Activities: $webTotalActivities, Table Rows: $webRowCount\n";
assertTest("3a. Web report has 7 activity records", $webRowCount === 7, "Found $webRowCount");

// Save XLSX to test contents
file_put_contents(__DIR__ . '/api_test_activity.xlsx', $res['body']);
$pyRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_activity.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); s2=z.read(\"xl/worksheets/sheet2.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1); print(\"Activity Audit Report\" in s2); print(z.namelist())"');
$pyLines = array_map('trim', explode("\n", trim($pyRes)));
$excelRowCount = intval($pyLines[0] ?? 0);
assertTest("3b. Excel sheet1 row count ($excelRowCount) matches web report ($webRowCount)", $excelRowCount === $webRowCount, "Excel has $excelRowCount rows");
assertTest("3c. Excel summary contains title Activity Audit Report", ($pyLines[1] ?? '') === 'True');

// 4. Role Filter Test (CRITICAL REGRESSION TEST)
// 4a. Role = superadmin (should return 6 rows)
$webSARes = makeRequest([
    'action' => 'get_report',
    'report' => 'activity_report',
    'role'   => 'superadmin'
], $adminHeaders);
$webSAJson = json_decode($webSARes['body'], true);
$webSARowCount = count($webSAJson['data']['table_rows'] ?? []);

$xlsxSARes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'xlsx',
    'role'   => 'superadmin'
], $adminHeaders);
file_put_contents(__DIR__ . '/api_test_sa.xlsx', $xlsxSARes['body']);
$pySARes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_sa.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1); print(\"Coach\" in s1)"');
$pySALines = array_map('trim', explode("\n", trim($pySARes)));
$saExcelRows = intval($pySALines[0] ?? 0);
$saContainsCoach = ($pySALines[1] ?? '') === 'True';
assertTest("4a. Role=Superadmin: Web has 6 rows", $webSARowCount === 6, "Found $webSARowCount");
assertTest("4b. Role=Superadmin: Excel has 6 rows", $saExcelRows === 6, "Found $saExcelRows");
assertTest("4c. Role=Superadmin: Excel does NOT contain Coach records", !$saContainsCoach);

// 4b. Role = coach (should return 1 row)
$webCoachRes = makeRequest([
    'action' => 'get_report',
    'report' => 'activity_report',
    'role'   => 'coach'
], $adminHeaders);
$webCoachJson = json_decode($webCoachRes['body'], true);
$webCoachRowCount = count($webCoachJson['data']['table_rows'] ?? []);

$xlsxCoachRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'xlsx',
    'role'   => 'coach'
], $adminHeaders);
file_put_contents(__DIR__ . '/api_test_coach.xlsx', $xlsxCoachRes['body']);
$pyCoachRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_coach.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1); print(\"Chirag Nagvekar\" in s1)"');
$pyCoachLines = array_map('trim', explode("\n", trim($pyCoachRes)));
$coachExcelRows = intval($pyCoachLines[0] ?? 0);
$coachHasChirag = ($pyCoachLines[1] ?? '') === 'True';
assertTest("4d. Role=Coach: Web has 1 row", $webCoachRowCount === 1, "Found $webCoachRowCount");
assertTest("4e. Role=Coach: Excel has 1 row", $coachExcelRows === 1, "Found $coachExcelRows");
assertTest("4f. Role=Coach: Excel contains Chirag Nagvekar", $coachHasChirag);

// 5. Module Filter Test (module = INVENTORY - 2 records)
$webInvRes = makeRequest([
    'action' => 'get_report',
    'report' => 'activity_report',
    'module' => 'INVENTORY'
], $adminHeaders);
$webInvJson = json_decode($webInvRes['body'], true);
$webInvRowCount = count($webInvJson['data']['table_rows'] ?? []);

$xlsxInvRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'xlsx',
    'module' => 'INVENTORY'
], $adminHeaders);
file_put_contents(__DIR__ . '/api_test_inv.xlsx', $xlsxInvRes['body']);
$pyInvRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_inv.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1); print(\"INVENTORY\" in s1)"');
$pyInvLines = array_map('trim', explode("\n", trim($pyInvRes)));
$invExcelRows = intval($pyInvLines[0] ?? 0);
assertTest("5a. Module=INVENTORY: Web has 2 rows", $webInvRowCount === 2, "Found $webInvRowCount");
assertTest("5b. Module=INVENTORY: Excel has 2 rows", $invExcelRows === 2, "Found $invExcelRows");

// 6. Search Filter Test (search = 'Audit Cones')
$webSearchRes = makeRequest([
    'action' => 'get_report',
    'report' => 'activity_report',
    'search' => 'Audit Cones'
], $adminHeaders);
$webSearchJson = json_decode($webSearchRes['body'], true);
$webSearchRowCount = count($webSearchJson['data']['table_rows'] ?? []);

$xlsxSearchRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'xlsx',
    'search' => 'Audit Cones'
], $adminHeaders);
file_put_contents(__DIR__ . '/api_test_search.xlsx', $xlsxSearchRes['body']);
$pySearchRes = shell_exec('python -c "import zipfile, re; z=zipfile.ZipFile(\"scratch/api_test_search.xlsx\"); s1=z.read(\"xl/worksheets/sheet1.xml\").decode(\"utf-8\"); rows=re.findall(r\'<row r=\"(\d+)\"\', s1); print(len(rows)-1); print(\"Audit Cones\" in s1)"');
$pySearchLines = array_map('trim', explode("\n", trim($pySearchRes)));
$searchExcelRows = intval($pySearchLines[0] ?? 0);
assertTest("6a. Search='Audit Cones': Web has 1 row", $webSearchRowCount === 1, "Found $webSearchRowCount");
assertTest("6b. Search='Audit Cones': Excel has 1 row with matching item", $searchExcelRows === 1 && ($pySearchLines[1] ?? '') === 'True');

// 7. Zero-Result Export
$zeroRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'pdf',
    'search' => 'NonExistentString12345'
], $adminHeaders);
assertTest("7a. Zero-result returns 200 HTTP code", $zeroRes['code'] === 200);
$zeroJson = json_decode($zeroRes['body'], true);
assertTest("7b. Zero-result returns empty=true JSON", !empty($zeroJson['empty']) && $zeroJson['empty'] === true);
assertTest("7c. Zero-result message is correct", ($zeroJson['message'] ?? '') === 'No activity data available to export for the selected filters.', "Message: " . ($zeroJson['message'] ?? ''));

// 8. Authorization Restrictions
$studentRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'pdf'
], $studentHeaders);
assertTest("8a. Student role is rejected with 403", $studentRes['code'] === 403, "Got " . $studentRes['code']);

$guestRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'pdf'
], ['X-VAVA-Role' => 'guest']);
assertTest("8b. Guest/unauthorized role is rejected with 403", $guestRes['code'] === 403, "Got " . $guestRes['code']);

// 9. Coach Export: Allowed for Coach, scoped to their activity
$coachExportRes = makeRequest([
    'action' => 'export_report',
    'report' => 'activity_report',
    'format' => 'pdf'
], $coachHeaders);
assertTest("9a. Coach role can export Activity report (200 OK)", $coachExportRes['code'] === 200, "Got " . $coachExportRes['code']);
assertTest("9b. Coach PDF starts with %PDF", substr($coachExportRes['body'], 0, 4) === '%PDF');

echo "\n========================================================\n";
echo "SUMMARY: Passed: $passCount, Failed: $failCount\n";
echo "========================================================\n";
