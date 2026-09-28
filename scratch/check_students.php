<?php
require_once __DIR__ . '/../server/db_connect.php';
$stmt = $pdo->query("SELECT student_id, student_name, student_photo FROM vsa_students LIMIT 10");
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $s) {
    echo $s['student_id'] . " | " . $s['student_name'] . " | " . ($s['student_photo'] ?: 'NULL') . "\n";
}
