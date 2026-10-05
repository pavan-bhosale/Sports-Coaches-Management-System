<?php
$ch = curl_init('http://localhost/VAVA_sports/server/dashboard.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-VAVA-Role: student', 'X-VAVA-Email: aarav.sharma@vavasports.local']);
$res = curl_exec($ch);
$json = json_decode($res, true);
echo "SUCCESS: " . ($json['success'] ? 'true' : 'false') . "\n";
echo "ROLE: " . $json['role'] . "\n";
echo "STUDENT: " . $json['user']['name'] . "\n";
echo "BATCH: " . json_encode($json['batch']) . "\n";
echo "ATTENDANCE RATE: " . $json['attendance']['rate'] . "%\n";
echo "PRESENT: " . $json['attendance']['present'] . "\n";
echo "ABSENT: " . $json['attendance']['absent'] . "\n";
echo "TIMELINE COUNT: " . count($json['attendance']['timeline']) . "\n";
echo "RECENT COUNT: " . count($json['attendance']['recent']) . "\n";
echo "HISTORY COUNT: " . count($json['attendance']['history']) . "\n";
if (!empty($json['attendance']['timeline'])) {
    echo "TIMELINE SAMPLE:\n";
    foreach ($json['attendance']['timeline'] as $t) {
        echo "  - " . $t['date_formatted'] . " (" . $t['day_name'] . "): " . $t['status'] . "\n";
    }
}
