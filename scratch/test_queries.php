<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== TEST COACH 101 (Tanya Raut) ===\n";
$coachId = 101;
$assignedStmt = $pdo->prepare("
    SELECT batch_id, batch_name, batch_time, batch_location, COALESCE(sport, 'Football') AS sport, max_students AS capacity
    FROM vsa_batches
    WHERE coach_id = ? AND status = 'Active'
");
$assignedStmt->execute([$coachId]);
$batches = $assignedStmt->fetchAll(PDO::FETCH_ASSOC);
$batchIds = array_column($batches, 'batch_id');
echo "Assigned batches: " . implode(', ', $batchIds) . "\n";

if (!empty($batchIds)) {
    $in = implode(',', array_fill(0, count($batchIds), '?'));
    // Students
    $stStmt = $pdo->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) as active FROM vsa_students WHERE batch_id IN ($in)");
    $stStmt->execute($batchIds);
    print_r($stStmt->fetch(PDO::FETCH_ASSOC));
}

echo "\n=== TEST STUDENT 8 (Test Student 4) ===\n";
$studentId = 8;
$stInfoStmt = $pdo->prepare("
    SELECT s.student_id, s.student_name, s.student_email, s.student_photo,
           b.batch_id, b.batch_name, b.batch_time, b.batch_location, COALESCE(b.sport, 'Football') as sport,
           c.coach_id, c.coach_name, c.coach_photo
    FROM vsa_students s
    LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
    LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
    WHERE s.student_id = ?
");
$stInfoStmt->execute([$studentId]);
print_r($stInfoStmt->fetch(PDO::FETCH_ASSOC));
