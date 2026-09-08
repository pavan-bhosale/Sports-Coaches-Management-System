<?php
require_once 'server/db_connect.php';

// Save attendance for student 8 (Test Student 4) as Present
$batch_id = 7;
$attendance_date = '2026-09-07';
$coach_id = 101;

$upsertStmt = $pdo->prepare('
    INSERT INTO vsa_attendance (batch_id, coach_id, student_id, attendance_date, status)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE status = VALUES(status), coach_id = VALUES(coach_id)
');
$upsertStmt->execute([$batch_id, $coach_id, 8, $attendance_date, 'Present']);

echo "Saved attendance for student 8 as Present.\n";

// Fetch updated sheets summary
$stmt = $pdo->query('
    SELECT 
        a.batch_id,
        a.attendance_date,
        b.batch_name,
        (
            SELECT COUNT(*) 
            FROM vsa_students s 
            WHERE s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))
        ) AS total_batch_students,
        COUNT(a.attendance_id) AS sheet_records_count,
        SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count
    FROM vsa_attendance a
    INNER JOIN vsa_batches b ON a.batch_id = b.batch_id
    WHERE a.batch_id = 7
    GROUP BY a.batch_id, a.attendance_date, b.batch_name
');
print_r($stmt->fetch());
?>
