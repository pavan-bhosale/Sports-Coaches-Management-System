<?php
/**
 * Diagnostic script for Enquiry: Student & Batch Report Current Student Count
 */
require_once __DIR__ . '/../server/db_connect.php';

echo "============================================================\n";
echo "1. VSA_STUDENTS INSPECTION\n";
echo "============================================================\n";

$students = $pdo->query("
    SELECT student_id, student_name, status, batch_id, batch_name, coach_id, coach_name 
    FROM vsa_students
")->fetchAll(PDO::FETCH_ASSOC);

echo "Total students: " . count($students) . "\n\n";
echo sprintf("%-5s | %-20s | %-10s | %-8s | %-25s | %-8s | %-20s\n", 
    "ID", "Name", "Status", "batch_id", "batch_name", "coach_id", "coach_name");
echo str_repeat("-", 105) . "\n";

$nullBatchIdCount = 0;
$zeroBatchIdCount = 0;
$validBatchIdCount = 0;
$hasBatchNameCount = 0;

foreach ($students as $s) {
    $bId = $s['batch_id'];
    if ($bId === null) $nullBatchIdCount++;
    elseif ($bId == 0) $zeroBatchIdCount++;
    else $validBatchIdCount++;

    if (!empty($s['batch_name'])) $hasBatchNameCount++;

    echo sprintf("%-5s | %-20s | %-10s | %-8s | %-25s | %-8s | %-20s\n",
        $s['student_id'],
        substr($s['student_name'], 0, 20),
        $s['status'] ?? 'NULL',
        $s['batch_id'] ?? 'NULL',
        substr($s['batch_name'] ?? 'NULL', 0, 25),
        $s['coach_id'] ?? 'NULL',
        substr($s['coach_name'] ?? 'NULL', 0, 20)
    );
}

echo "\nSummary of vsa_students batch links:\n";
echo "- batch_id IS NULL: {$nullBatchIdCount}\n";
echo "- batch_id = 0: {$zeroBatchIdCount}\n";
echo "- batch_id > 0: {$validBatchIdCount}\n";
echo "- batch_name populated: {$hasBatchNameCount}\n";

echo "\n============================================================\n";
echo "2. VSA_BATCHES INSPECTION\n";
echo "============================================================\n";

$batches = $pdo->query("
    SELECT batch_id, batch_name, batch_location, batch_time, coach_id, current_students, max_students, status 
    FROM vsa_batches
")->fetchAll(PDO::FETCH_ASSOC);

echo "Total batches: " . count($batches) . "\n\n";
echo sprintf("%-8s | %-30s | %-15s | %-8s | %-8s | %-16s | %-8s\n", 
    "batch_id", "batch_name", "location", "time", "coach_id", "current_students", "status");
echo str_repeat("-", 105) . "\n";

foreach ($batches as $b) {
    echo sprintf("%-8s | %-30s | %-15s | %-8s | %-8s | %-16s | %-8s\n",
        $b['batch_id'],
        substr($b['batch_name'], 0, 30),
        substr($b['batch_location'] ?? '—', 0, 15),
        $b['batch_time'] ?? '—',
        $b['coach_id'] ?? 'NULL',
        $b['current_students'] ?? 'NULL',
        $b['status'] ?? 'NULL'
    );
}

echo "\n============================================================\n";
echo "3. BATCH NAME MATCHING INSPECTION\n";
echo "============================================================\n";
// Let's see if student batch_name strings match any batch_name in vsa_batches
$matchStmt = $pdo->query("
    SELECT 
        s.student_id,
        s.student_name,
        s.batch_id AS student_batch_id,
        s.batch_name AS student_batch_name,
        b.batch_id AS matched_batch_id,
        b.batch_name AS matched_batch_name
    FROM vsa_students s
    LEFT JOIN vsa_batches b ON LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))
");
$matches = $matchStmt->fetchAll(PDO::FETCH_ASSOC);
echo "\n============================================================\n";
echo "4. COACHES INSPECTION\n";
echo "============================================================\n";
foreach ($pdo->query("SELECT coach_id, coach_name FROM vsa_coaches") as $c) {
    echo "{$c['coach_id']} : {$c['coach_name']}\n";
}

echo "\nStudent #19 details:\n";
$s19 = $pdo->query("SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students WHERE student_id = 19")->fetch(PDO::FETCH_ASSOC);
print_r($s19);
