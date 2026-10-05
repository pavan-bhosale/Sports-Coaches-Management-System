<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== VSA_STUDENT_FEES COLUMNS ===\n";
$stmt = $pdo->query("DESCRIBE vsa_student_fees");
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $col) {
    echo "{$col['Field']} - {$col['Type']} - Null:{$col['Null']} - Default:{$col['Default']}\n";
}

echo "\n=== SAMPLE ROWS FOR STUDENT ID 3 (Aarav Sharma) ===\n";
$stmt = $pdo->prepare("SELECT * FROM vsa_student_fees WHERE student_id = 3 ORDER BY fee_month ASC");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

echo "\n=== SAMPLE ROWS FOR STUDENT ID 4 ===\n";
$stmt = $pdo->prepare("SELECT * FROM vsa_student_fees WHERE student_id = 4 ORDER BY fee_month ASC");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

echo "\n=== STUDENT FEE SUMMARY ACROSS ALL STUDENTS ===\n";
$stmt = $pdo->query("SELECT student_id, COUNT(*) as total_records, 
                     SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
                     SUM(CASE WHEN payment_status != 'Paid' THEN 1 ELSE 0 END) as unpaid_count,
                     MIN(fee_month) as min_month, MAX(fee_month) as max_month
                     FROM vsa_student_fees GROUP BY student_id");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

