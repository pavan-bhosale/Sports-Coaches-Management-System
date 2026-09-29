<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== ALL 12 STUDENTS IN vsa_students ===\n";
$st = $pdo->query('SELECT student_id, student_name, branch_name, batch_id, batch_name, coach_id, coach_name, status FROM vsa_students ORDER BY student_id');
$students = $st->fetchAll(PDO::FETCH_ASSOC);
foreach ($students as $s) {
    echo sprintf(
        "ID:%2d | Name:%-20s | Branch:%-12s | BatchID:%-4s | BatchName:%-30s | CoachID:%-4s | CoachName:%s\n",
        $s['student_id'],
        $s['student_name'],
        $s['branch_name'],
        var_export($s['batch_id'], true),
        $s['batch_name'],
        var_export($s['coach_id'], true),
        $s['coach_name']
    );
}

echo "\n=== ALL 20 BATCHES IN vsa_batches ===\n";
$bt = $pdo->query('SELECT b.batch_id, b.batch_name, b.batch_time, b.batch_location, b.coach_id, c.coach_name, b.current_students, b.status FROM vsa_batches b LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id ORDER BY b.batch_id');
$batches = $bt->fetchAll(PDO::FETCH_ASSOC);
foreach ($batches as $b) {
    echo sprintf(
        "BatchID:%2d | Name:%-32s | Time:%-8s | Loc:%-18s | CoachID:%-4s | Coach:%-22s | CurStudents:%d\n",
        $b['batch_id'],
        $b['batch_name'],
        $b['batch_time'],
        $b['batch_location'],
        var_export($b['coach_id'], true),
        $b['coach_name'] ?? 'None',
        $b['current_students']
    );
}

echo "\n=== ALL COACHES IN vsa_coaches ===\n";
$ct = $pdo->query('SELECT coach_id, coach_name, coach_email, batch_id, batch_name FROM vsa_coaches ORDER BY coach_id');
$coaches = $ct->fetchAll(PDO::FETCH_ASSOC);
foreach ($coaches as $c) {
    echo sprintf(
        "CoachID:%3d | Name:%-25s | Email:%-25s | BatchID:%-4s | BatchName:%s\n",
        $c['coach_id'],
        $c['coach_name'],
        $c['coach_email'],
        var_export($c['batch_id'], true),
        $c['batch_name']
    );
}
