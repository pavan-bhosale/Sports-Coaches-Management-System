<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== COACHES AND THEIR BATCHES ===\n";
$stmt = $pdo->query("
    SELECT c.coach_id, c.coach_name, c.coach_email, c.batch_id as coach_batch_id,
           b.batch_id, b.batch_name, b.coach_id as batch_coach_id, b.max_students
    FROM vsa_coaches c
    LEFT JOIN vsa_batches b ON b.coach_id = c.coach_id
    ORDER BY c.coach_id
");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "Coach {$row['coach_id']} ({$row['coach_name']}, {$row['coach_email']}): assigned batch {$row['batch_id']} ({$row['batch_name']})\n";
}

echo "\n=== BATCHES AND STUDENT COUNTS ===\n";
$stmt = $pdo->query("
    SELECT b.batch_id, b.batch_name, b.coach_id, c.coach_name,
           COUNT(s.student_id) as student_count
    FROM vsa_batches b
    LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
    LEFT JOIN vsa_students s ON s.batch_id = b.batch_id
    GROUP BY b.batch_id
");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "Batch {$row['batch_id']} ({$row['batch_name']}): Coach {$row['coach_id']} ({$row['coach_name']}) - {$row['student_count']} students\n";
}

echo "\n=== SAMPLE STUDENTS AND THEIR ATTENDANCE ===\n";
$stmt = $pdo->query("
    SELECT s.student_id, s.student_name, s.student_email, s.batch_id, b.batch_name,
           COUNT(a.attendance_id) as total_attendance,
           SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present_count,
           SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_count
    FROM vsa_students s
    LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
    LEFT JOIN vsa_attendance a ON a.student_id = s.student_id
    GROUP BY s.student_id
    LIMIT 10
");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "Student {$row['student_id']} ({$row['student_name']}, {$row['student_email']}): Batch {$row['batch_id']} ({$row['batch_name']}) - Att: {$row['total_attendance']} (Pres: {$row['present_count']}, Abs: {$row['absent_count']})\n";
}
