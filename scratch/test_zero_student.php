<?php
require_once 'server/db_connect.php';

// Find a student with 0 attendance
$stmt = $pdo->query("
    SELECT s.student_id, s.student_name, s.student_email, COUNT(a.attendance_id) as att_cnt
    FROM vsa_students s
    LEFT JOIN vsa_attendance a ON s.student_id = a.student_id
    GROUP BY s.student_id
    HAVING att_cnt = 0
    LIMIT 1
");
$zeroStudent = $stmt->fetch(PDO::FETCH_ASSOC);

if ($zeroStudent) {
    echo "Testing zero-attendance student: " . $zeroStudent['student_name'] . " (" . $zeroStudent['student_email'] . ")\n";
    $ch = curl_init('http://localhost/VAVA_sports/server/dashboard.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-VAVA-Role: student', 'X-VAVA-Email: ' . $zeroStudent['student_email']]);
    $res = curl_exec($ch);
    $json = json_decode($res, true);
    echo "SUCCESS: " . ($json['success'] ? 'true' : 'false') . "\n";
    echo "RATE: " . var_export($json['attendance']['rate'], true) . "\n";
    echo "PRESENT: " . $json['attendance']['present'] . "\n";
    echo "ABSENT: " . $json['attendance']['absent'] . "\n";
    echo "TOTAL: " . $json['attendance']['total'] . "\n";
    echo "TIMELINE COUNT: " . count($json['attendance']['timeline']) . "\n";
    echo "HISTORY COUNT: " . count($json['attendance']['history']) . "\n";
} else {
    echo "No zero attendance student in DB\n";
}
