<?php
require_once 'server/db_connect.php';

echo "\n=== SAMPLE STUDENTS ===\n";
$stmt = $pdo->query('SELECT student_id, student_name, batch_id, batch_name, monthly_fee, status FROM vsa_students LIMIT 10');
print_r($stmt->fetchAll());

echo "\n=== SAMPLE BATCHES ===\n";
$stmt = $pdo->query('SELECT batch_id, batch_name, monthly_fee, status FROM vsa_batches');
print_r($stmt->fetchAll());

echo "\n=== COUNT OF STUDENTS BY STATUS ===\n";
$stmt = $pdo->query('SELECT status, COUNT(*) as count FROM vsa_students GROUP BY status');
print_r($stmt->fetchAll());

echo "\n=== CHECK ZERO OR NULL MONTHLY FEES IN STUDENTS ===\n";
$stmt = $pdo->query('SELECT COUNT(*) as count_zero_or_null FROM vsa_students WHERE monthly_fee IS NULL OR monthly_fee = 0');
print_r($stmt->fetch());

echo "\n=== BATCHES MONTHLY FEE RANGE ===\n";
$stmt = $pdo->query('SELECT batch_id, batch_name, monthly_fee FROM vsa_batches');
print_r($stmt->fetchAll());
?>
