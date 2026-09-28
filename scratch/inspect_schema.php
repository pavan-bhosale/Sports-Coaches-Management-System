<?php
require_once __DIR__ . '/../server/db_connect.php';

$sql = "SELECT b.batch_id, b.batch_name, COUNT(s.student_id) as student_count 
        FROM vsa_batches b 
        LEFT JOIN vsa_students s ON (s.batch_id = b.batch_id OR (s.batch_id IS NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))) 
        GROUP BY b.batch_id";

foreach ($pdo->query($sql) as $row) {
    echo "{$row['batch_id']} | {$row['batch_name']} | dynamic students count: {$row['student_count']}\n";
}
