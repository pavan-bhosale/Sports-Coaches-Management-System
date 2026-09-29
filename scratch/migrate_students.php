<?php
/**
 * Safe Data Migration for Existing Students
 * Only updates students with UNIQUE MATCH.
 * Leaves AMBIGUOUS MATCH (Student #19) and NO MATCH records completely untouched.
 */
require_once __DIR__ . '/../server/db_connect.php';

echo "=== VAVA SPORTS: EXISTING STUDENT BATCH_ID MIGRATION ===\n\n";

// 1. Fetch current students
$stmt = $pdo->query('SELECT student_id, student_name, batch_id, batch_name, coach_id, coach_name FROM vsa_students ORDER BY student_id');
$students = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Total existing students in vsa_students: " . count($students) . "\n\n";

$mappedCount = 0;
$ambiguousCount = 0;
$noMatchCount = 0;
$alreadyMappedCount = 0;

$pdo->beginTransaction();

try {
    foreach ($students as $s) {
        $sId = $s['student_id'];
        $sName = $s['student_name'];
        $bName = trim($s['batch_name'] ?? '');
        
        if (!empty($s['batch_id']) && intval($s['batch_id']) > 0) {
            echo "Student #{$sId} ({$sName}) already has batch_id {$s['batch_id']}. Skipping.\n";
            $alreadyMappedCount++;
            continue;
        }

        if (empty($bName) || $bName === 'No Batch') {
            echo "Student #{$sId} ({$sName}): Stored batch is empty/'No Batch'. Status: NO MATCH. Left unchanged.\n";
            $noMatchCount++;
            continue;
        }

        // Search for matching batches
        $bStmt = $pdo->prepare('
            SELECT b.batch_id, b.batch_name, b.coach_id, c.coach_name
            FROM vsa_batches b
            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            WHERE LOWER(TRIM(b.batch_name)) = LOWER(?)
        ');
        $bStmt->execute([$bName]);
        $matches = $bStmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($matches) === 0) {
            echo "Student #{$sId} ({$sName}): Batch '{$bName}' not found in vsa_batches. Status: NO MATCH. Left unchanged.\n";
            $noMatchCount++;
        } elseif (count($matches) === 1) {
            $matched = $matches[0];
            $targetBatchId = intval($matched['batch_id']);
            $targetBatchName = $matched['batch_name'];
            $targetCoachId = !empty($matched['coach_id']) ? intval($matched['coach_id']) : null;
            $targetCoachName = !empty($matched['coach_name']) ? $matched['coach_name'] : $s['coach_name'];

            $upd = $pdo->prepare('
                UPDATE vsa_students
                SET batch_id = ?, batch_name = ?, coach_id = ?, coach_name = ?
                WHERE student_id = ?
            ');
            $upd->execute([
                $targetBatchId,
                $targetBatchName,
                $targetCoachId,
                $targetCoachName,
                $sId
            ]);

            echo "Student #{$sId} ({$sName}): UNIQUE MATCH -> Batch ID {$targetBatchId} ({$targetBatchName}), Coach ID {$targetCoachId} ({$targetCoachName}). UPDATED.\n";
            $mappedCount++;
        } else {
            $mIds = implode(', ', array_column($matches, 'batch_id'));
            echo "Student #{$sId} ({$sName}): '{$bName}' matches " . count($matches) . " batches (IDs: {$mIds}). Status: AMBIGUOUS MATCH. Left unchanged.\n";
            $ambiguousCount++;
        }
    }

    $pdo->commit();
    echo "\n=== MIGRATION SUMMARY ===\n";
    echo "Total Students Inspected: " . count($students) . "\n";
    echo "Already Had batch_id: {$alreadyMappedCount}\n";
    echo "Safely Mapped (UNIQUE MATCH): {$mappedCount}\n";
    echo "Ambiguous (Left Unchanged): {$ambiguousCount}\n";
    echo "No Match (Left Unchanged): {$noMatchCount}\n";

} catch (Exception $e) {
    $pdo->rollBack();
    echo "ERROR during migration: " . $e->getMessage() . "\n";
    exit(1);
}
