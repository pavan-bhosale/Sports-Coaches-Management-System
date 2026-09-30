<?php
require_once __DIR__ . '/../server/db_connect.php';

function makeCoachRequest($url, $method = 'POST', $data = []) {
    $ch = curl_init('http://localhost/VAVA_sports/' . ltrim($url, '/'));
    $headers = [
        'Content-Type: application/json',
        'X-VAVA-Role: coach',
        'X-VAVA-Email: chiragdnagvekar@gmail.com',
        'X-VAVA-Coach-ID: 100',
        'X-VAVA-Actor-Name: Chirag Nagvekar'
    ];
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    $output = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'json' => json_decode($output, true), 'raw' => $output];
}

$date = '2026-10-' . rand(10, 28);
echo "Creating attendance sheet for Coach Chirag Nagvekar (Batch 10, Date $date)...\n";
$res = makeCoachRequest('server/attendance.php', 'POST', [
    'action' => 'create_sheet',
    'batch_id' => 10,
    'attendance_date' => $date
]);
echo "Code: {$res['code']} | Response: " . json_encode($res['json']) . "\n";

$sheetId = $res['json']['sheet_id'] ?? 0;
if ($sheetId) {
    echo "Now saving attendance marks for sheet...\n";
    $saveRes = makeCoachRequest('server/attendance.php', 'POST', [
        'action' => 'save_attendance',
        'batch_id' => 10,
        'attendance_date' => $date,
        'attendance_data' => [
            ['student_id' => 3, 'status' => 'Present'],
            ['student_id' => 6, 'status' => 'Absent']
        ]
    ]);
    echo "Save Attendance Code: {$saveRes['code']} | Response: " . json_encode($saveRes['json']) . "\n";
}

// Check vsa_activity_log for Coach activities
$stmt = $pdo->query("SELECT activity_id, created_at, actor_name, actor_role, module, action_type, description FROM vsa_activity_log WHERE actor_role = 'coach' ORDER BY activity_id DESC LIMIT 5");
echo "\nLatest Coach Activities in Database:\n";
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
    echo "#{$r['activity_id']} [{$r['created_at']}] [{$r['module']}] [{$r['action_type']}] {$r['actor_name']} ({$r['actor_role']}): {$r['description']}\n";
}
