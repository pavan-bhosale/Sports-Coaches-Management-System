<?php
require_once __DIR__ . '/../server/db_connect.php';
$stmt = $pdo->query("SELECT student_id, student_name, student_email, batch_name, coach_name FROM vsa_students LIMIT 10");
$students = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "Students in vsa_students:\n";
foreach ($students as $s) {
    echo "ID: {$s['student_id']} | Name: {$s['student_name']} | Email: {$s['student_email']} | Batch: {$s['batch_name']} | Coach: {$s['coach_name']}\n";
}
