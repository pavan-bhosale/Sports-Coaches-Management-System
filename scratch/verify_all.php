<?php
/**
 * Comprehensive Verification Script for Student -> Batch Assignment Fix
 */
require_once __DIR__ . '/../server/db_connect.php';

echo "============================================================\n";
echo "A. STUDENT BATCH ASSIGNMENT DIRECT DB QUERY\n";
echo "============================================================\n";
$stmtA = $pdo->query('SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students ORDER BY student_id');
$allStudents = $stmtA->fetchAll(PDO::FETCH_ASSOC);
foreach ($allStudents as $s) {
    echo sprintf(
        "ID:%2d | Name:%-18s | BatchID:%-4s | BatchName:%-30s | CoachID:%-4s | Coach:%s\n",
        $s['student_id'],
        $s['student_name'],
        var_export($s['batch_id'], true),
        $s['batch_name'] ?? 'NULL',
        var_export($s['coach_id'], true),
        $s['coach_name'] ?? 'NULL'
    );
}

echo "\n============================================================\n";
echo "B. COUNT STUDENTS WITH BATCH_ID\n";
echo "============================================================\n";
$stmtB = $pdo->query('SELECT COUNT(*) as cnt FROM vsa_students WHERE batch_id IS NOT NULL');
$countWithBatch = $stmtB->fetch(PDO::FETCH_ASSOC)['cnt'];
echo "Students with batch_id IS NOT NULL: {$countWithBatch} / " . count($allStudents) . "\n";

echo "\n============================================================\n";
echo "C. VALIDATE REFERENCED BATCHES (ORPHAN CHECK)\n";
echo "============================================================\n";
$stmtC = $pdo->query('
    SELECT s.student_id, s.student_name, s.batch_id 
    FROM vsa_students s
    LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
    WHERE s.batch_id IS NOT NULL AND b.batch_id IS NULL
');
$orphans = $stmtC->fetchAll(PDO::FETCH_ASSOC);
if (count($orphans) === 0) {
    echo "PASS: Zero orphan batch references found. All assigned batch_ids exist in vsa_batches.\n";
} else {
    echo "FAIL: Found " . count($orphans) . " students referencing invalid batch_ids!\n";
    print_r($orphans);
}

echo "\n============================================================\n";
echo "D. REPORT CALCULATION (STUDENT & BATCH REPORT API)\n";
echo "============================================================\n";
$ch = curl_init('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=student_batch');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$res = curl_exec($ch);
curl_close($ch);

$reportJson = json_decode($res, true);
if ($reportJson && !empty($reportJson['success'])) {
    $data = $reportJson['data'];
    echo "Report Title: " . $data['report_title'] . "\n";
    echo "Summary Metrics:\n";
    foreach ($data['summary_metrics'] as $m) {
        echo "  - {$m['label']}: {$m['value']} ({$m['subtext']})\n";
    }
    echo "\nBatch Capacity Summary (Top 5):\n";
    $topBatches = array_slice($data['batch_summary']['rows'], 0, 5);
    foreach ($topBatches as $row) {
        echo "  - {$row[0]} | Coach: {$row[1]} | Schedule: {$row[3]} | Current Count: {$row[4]}\n";
    }
    echo "\nStudents Table Sample (first 5):\n";
    $first5Students = array_slice($data['table_rows'], 0, 5);
    foreach ($first5Students as $row) {
        echo "  - {$row[0]} | Batch: {$row[1]} | Coach: {$row[2]} | Branch: {$row[3]} | Status: {$row[5]}\n";
    }
} else {
    echo "FAIL: Could not load student_batch report!\nResponse: " . substr($res, 0, 300) . "\n";
}

echo "\n============================================================\n";
echo "E. DUPLICATE NAMES RESOLUTION VERIFICATION\n";
echo "============================================================\n";
$dupStmt = $pdo->query('SELECT batch_id, batch_name, coach_id FROM vsa_batches WHERE batch_name = "Elite Evening Training Camp"');
$dups = $dupStmt->fetchAll(PDO::FETCH_ASSOC);
echo "Duplicate batches for 'Elite Evening Training Camp':\n";
foreach ($dups as $d) {
    echo "  - Batch ID: {$d['batch_id']}, Coach ID: {$d['coach_id']}\n";
}

echo "\n============================================================\n";
echo "F. ADD STUDENT TEST FLOW\n";
echo "============================================================\n";
// Let's create a test student assigned to duplicate batch ID 46 specifically
$testAddPayload = [
    'student_name'             => 'Automated Test Student ' . time(),
    'parent_name'              => 'Parent Test',
    'date_of_birth'            => '2010-05-15',
    'gender'                   => 'male',
    'blood_group'              => 'O+',
    'branch_name'              => 'virar',
    'batch_id'                 => 46, // Specific duplicate batch ID!
    'batch_name'               => 'Elite Evening Training Camp',
    'coach_id'                 => 111,
    'coach_name'               => 'UI Test Coach 1790602651806',
    'address'                  => '123 Test Street',
    'city'                     => 'Mumbai',
    'postal_code'              => '400001',
    'father_contact_number'    => '9876543210',
    'mother_contact_number'    => '',
    'emergency_contact_number' => '9876543211',
    'whatsapp_number'          => '9876543210',
    'student_email'            => 'autotest_' . time() . '@test.com',
    'school_name'              => 'Test High School'
];

$ch = curl_init('http://localhost/VAVA_sports/server/students.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($testAddPayload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$addRes = curl_exec($ch);
curl_close($ch);

$addJson = json_decode($addRes, true);
$createdStudentId = null;
if ($addJson && !empty($addJson['success']) && !empty($addJson['student_id'])) {
    $createdStudentId = intval($addJson['student_id']);
    echo "SUCCESS: Created student ID {$createdStudentId}\n";
    $verifyStmt = $pdo->prepare('SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students WHERE student_id = ?');
    $verifyStmt->execute([$createdStudentId]);
    $createdStudent = $verifyStmt->fetch(PDO::FETCH_ASSOC);
    echo "Verified in DB: Batch ID={$createdStudent['batch_id']} (Expected: 46), Batch Name='{$createdStudent['batch_name']}', Coach ID={$createdStudent['coach_id']}\n";
    if ($createdStudent['batch_id'] == 46) {
        echo "PASS: Student correctly assigned to exact duplicate batch ID 46!\n";
    } else {
        echo "FAIL: Expected batch_id 46, got " . var_export($createdStudent['batch_id'], true) . "\n";
    }
} else {
    echo "FAIL: Add student API failed: {$addRes}\n";
}

echo "\n============================================================\n";
echo "G. EDIT STUDENT TEST FLOW (CHANGE BATCH)\n";
echo "============================================================\n";
if ($createdStudentId) {
    // Change batch from ID 46 to ID 10 (Batch 3)
    $editPayload = [
        'student_id'               => $createdStudentId,
        'student_name'             => 'Automated Test Student Edited',
        'parent_name'              => 'Parent Test',
        'date_of_birth'            => '2010-05-15',
        'gender'                   => 'male',
        'blood_group'              => 'O+',
        'branch_name'              => 'virar',
        'batch_id'                 => 10, // Change to Batch 3
        'batch_name'               => 'Batch 3',
        'coach_id'                 => 100,
        'coach_name'               => 'Chirag Nagvekar',
        'address'                  => '123 Test Street',
        'city'                     => 'Mumbai',
        'postal_code'              => '400001',
        'father_contact_number'    => '9876543210',
        'mother_contact_number'    => '',
        'emergency_contact_number' => '9876543211',
        'whatsapp_number'          => '9876543210',
        'student_email'            => 'autotest_' . time() . '@test.com',
        'school_name'              => 'Test High School'
    ];

    $ch = curl_init('http://localhost/VAVA_sports/server/students.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($editPayload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $editRes = curl_exec($ch);
    curl_close($ch);

    $verifyStmt = $pdo->prepare('SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students WHERE student_id = ?');
    $verifyStmt->execute([$createdStudentId]);
    $editedStudent = $verifyStmt->fetch(PDO::FETCH_ASSOC);
    echo "Verified in DB: Batch ID={$editedStudent['batch_id']} (Expected: 10), Batch Name='{$editedStudent['batch_name']}', Coach ID={$editedStudent['coach_id']}\n";
    if ($editedStudent['batch_id'] == 10) {
        echo "PASS: Student batch updated to 10 successfully!\n";
    } else {
        echo "FAIL: Expected batch_id 10, got " . var_export($editedStudent['batch_id'], true) . "\n";
    }
}

echo "\n============================================================\n";
echo "H. UNASSIGN TEST FLOW\n";
echo "============================================================\n";
if ($createdStudentId) {
    // Unassign student (batch_id: 0 / No Batch)
    $unassignPayload = [
        'student_id'               => $createdStudentId,
        'student_name'             => 'Automated Test Student Unassigned',
        'parent_name'              => 'Parent Test',
        'date_of_birth'            => '2010-05-15',
        'gender'                   => 'male',
        'blood_group'              => 'O+',
        'branch_name'              => 'virar',
        'batch_id'                 => 0, // Unassigned!
        'batch_name'               => 'No Batch',
        'coach_id'                 => 0,
        'coach_name'               => 'Unassigned Coach',
        'address'                  => '123 Test Street',
        'city'                     => 'Mumbai',
        'postal_code'              => '400001',
        'father_contact_number'    => '9876543210',
        'mother_contact_number'    => '',
        'emergency_contact_number' => '9876543211',
        'whatsapp_number'          => '9876543210',
        'student_email'            => 'autotest_' . time() . '@test.com',
        'school_name'              => 'Test High School'
    ];

    $ch = curl_init('http://localhost/VAVA_sports/server/students.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($unassignPayload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    $unRes = curl_exec($ch);
    curl_close($ch);

    $verifyStmt = $pdo->prepare('SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students WHERE student_id = ?');
    $verifyStmt->execute([$createdStudentId]);
    $unassignedStudent = $verifyStmt->fetch(PDO::FETCH_ASSOC);
    echo "Verified in DB: Batch ID=" . var_export($unassignedStudent['batch_id'], true) . " (Expected: NULL), Batch Name='{$unassignedStudent['batch_name']}'\n";
    if ($unassignedStudent['batch_id'] === null) {
        echo "PASS: Student batch successfully unassigned (batch_id is NULL)!\n";
    } else {
        echo "FAIL: Expected batch_id NULL, got " . var_export($unassignedStudent['batch_id'], true) . "\n";
    }

    // Clean up test student
    $pdo->prepare('DELETE FROM vsa_students WHERE student_id = ?')->execute([$createdStudentId]);
    echo "Cleaned up test student #{$createdStudentId}.\n";
}

echo "\n============================================================\n";
echo "I. RE-VALIDATE FINAL STATE OF THE 12 REAL STUDENTS\n";
echo "============================================================\n";
$stmtFinal = $pdo->query('SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students ORDER BY student_id');
$finalStudents = $stmtFinal->fetchAll(PDO::FETCH_ASSOC);
echo "Final count of students: " . count($finalStudents) . "\n";
foreach ($finalStudents as $s) {
    echo sprintf(
        "ID:%2d | Name:%-18s | BatchID:%-4s | BatchName:%-30s | CoachID:%-4s | Coach:%s\n",
        $s['student_id'],
        $s['student_name'],
        var_export($s['batch_id'], true),
        $s['batch_name'] ?? 'NULL',
        var_export($s['coach_id'], true),
        $s['coach_name'] ?? 'NULL'
    );
}
