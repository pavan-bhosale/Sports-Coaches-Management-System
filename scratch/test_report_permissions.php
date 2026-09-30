<?php
require_once __DIR__ . '/../server/db_connect.php';

function fetchReportAs($role, $email, $coachId) {
    $url = 'http://localhost/VAVA_sports/server/reports.php?action=get_report&report=activity_report';
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-VAVA-Role: ' . $role,
        'X-VAVA-Email: ' . $email,
        'X-VAVA-Coach-ID: ' . $coachId
    ]);
    $output = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'json' => json_decode($output, true)];
}

echo "=== TEST 1: SUPERADMIN REQUESTS ACTIVITY REPORT ===\n";
$saRes = fetchReportAs('superadmin', 'vavasportsacademy@gmail.com', 0);
echo "Superadmin HTTP: {$saRes['code']}\n";
echo "Total Activities visible to Superadmin: " . ($saRes['json']['data']['summary_metrics'][0]['value'] ?? 'N/A') . "\n";
echo "Activities count: " . count($saRes['json']['data']['activities'] ?? []) . "\n\n";

echo "=== TEST 2: COACH REQUESTS ACTIVITY REPORT ===\n";
$coachRes = fetchReportAs('coach', 'chiragdnagvekar@gmail.com', 100);
echo "Coach HTTP: {$coachRes['code']}\n";
echo "Total Activities visible to Coach: " . ($coachRes['json']['data']['summary_metrics'][0]['value'] ?? 'N/A') . "\n";
echo "Activities count: " . count($coachRes['json']['data']['activities'] ?? []) . "\n";
foreach ($coachRes['json']['data']['activities'] ?? [] as $a) {
    echo "- Activity #{$a['activity_id']} [{$a['actor_role']}] {$a['actor_name']}: {$a['description']}\n";
}
