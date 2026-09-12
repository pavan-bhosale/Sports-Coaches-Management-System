<?php
require_once 'server/db_connect.php';

echo "=== CHECK STUDENT BATCH MATCHING ===\n";
$stmt = $pdo->query('
    SELECT s.student_id, s.student_name, s.batch_id as student_batch_id, s.batch_name as student_batch_name,
           b.batch_id as matched_batch_id, b.batch_name as matched_batch_name
    FROM vsa_students s
    LEFT JOIN vsa_batches b ON (s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
');
print_r($stmt->fetchAll());
?>
