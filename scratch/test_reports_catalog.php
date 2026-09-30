<?php
// Scratch test script for Reports & Analytics catalog
$_SERVER['HTTP_X_VAVA_ROLE'] = 'superadmin';
$_SERVER['HTTP_X_VAVA_EMAIL'] = 'admin@vavasports.com';

function testEndpoint($action, $report = null, $filters = [], $role = 'superadmin') {
    $params = ['action' => $action];
    if ($report) $params['report'] = $report;
    foreach ($filters as $k => $v) $params[$k] = $v;
    $url = 'http://localhost/VAVA_sports/server/reports.php?' . http_build_query($params);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-VAVA-Role: ' . $role,
        'X-VAVA-Email: admin@vavasports.com',
        'X-VAVA-Coach-ID: 100'
    ]);
    $output = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode($output, true);
    return ['code' => $code, 'json' => $json, 'raw' => substr($output, 0, 300)];
}

echo "=== TESTING FILTER OPTIONS ===\n";
$res = testEndpoint('filter_options');
echo "Code: " . $res['code'] . " | Success: " . ($res['json']['success'] ? 'YES' : 'NO') . "\n";
echo "Has activity_modules: " . (isset($res['json']['data']['activity_modules']) ? 'YES' : 'NO') . "\n";
echo "Has activity_actions: " . (isset($res['json']['data']['activity_actions']) ? 'YES' : 'NO') . "\n";
echo "Has activity_roles: " . (isset($res['json']['data']['activity_roles']) ? 'YES' : 'NO') . "\n\n";

echo "=== TESTING ATTENDANCE REPORT ===\n";
$res = testEndpoint('get_report', 'attendance_report');
echo "Code: " . $res['code'] . " | Success: " . ($res['json']['success'] ? 'YES' : 'NO') . " | Title: " . ($res['json']['data']['title'] ?? 'N/A') . "\n\n";

echo "=== TESTING FEES & PAYMENTS REPORT ===\n";
$res = testEndpoint('get_report', 'fees_payments');
echo "Code: " . $res['code'] . " | Success: " . ($res['json']['success'] ? 'YES' : 'NO') . " | Title: " . ($res['json']['data']['title'] ?? 'N/A') . "\n\n";

echo "=== TESTING ACTIVITY REPORT ===\n";
$res = testEndpoint('get_report', 'activity_report');
echo "Code: " . $res['code'] . " | Success: " . ($res['json']['success'] ? 'YES' : 'NO') . " | Title: " . ($res['json']['data']['title'] ?? 'N/A') . "\n";
echo "Total Activities: " . ($res['json']['data']['summary_metrics'][0]['value'] ?? 'N/A') . "\n";
echo "Activities Returned: " . count($res['json']['data']['activities'] ?? []) . "\n\n";

echo "=== TESTING REMOVED REPORTS (MUST FAIL WITH 400) ===\n";
foreach (['student_batch', 'coach_activity', 'inventory_report', 'random_fake_report'] as $rep) {
    http_response_code(200); // reset
    $res = testEndpoint('get_report', $rep);
    echo "Report: $rep => Code: " . $res['code'] . " | Success: " . ($res['json']['success'] ? 'true' : 'false') . " | Error: " . ($res['json']['error'] ?? 'None') . "\n";
}
