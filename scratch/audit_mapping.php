<?php
require_once __DIR__ . '/../server/db_connect.php';

$st = $pdo->query('SELECT * FROM vsa_students ORDER BY student_id');
$students = $st->fetchAll(PDO::FETCH_ASSOC);

echo "Total students: " . count($students) . "\n\n";

$headers = ["Student ID", "Student Name", "Stored Batch Name", "Matching Batch IDs", "Mapping Status", "Details"];
echo sprintf("%-11s | %-20s | %-32s | %-19s | %-16s | %s\n", $headers[0], $headers[1], $headers[2], $headers[3], $headers[4], $headers[5]);
echo str_repeat("-", 120) . "\n";

foreach ($students as $s) {
    $batchName = trim($s['batch_name'] ?? '');
    if (empty($batchName) || $batchName === 'No Batch') {
        $matchingBatchIds = [];
        $status = "NO MATCH";
        $details = "Student has no batch assigned";
    } else {
        $bStmt = $pdo->prepare('SELECT batch_id, batch_name, batch_location, batch_time, coach_id FROM vsa_batches WHERE LOWER(TRIM(batch_name)) = LOWER(?)');
        $bStmt->execute([$batchName]);
        $matches = $bStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $matchIds = array_map(function($m) { return $m['batch_id']; }, $matches);
        $matchingBatchIds = implode(', ', $matchIds);
        
        if (count($matches) === 0) {
            $status = "NO MATCH";
            $details = "No batch found with name '{$batchName}'";
        } elseif (count($matches) === 1) {
            $status = "UNIQUE MATCH";
            $b = $matches[0];
            $details = "Batch ID {$b['batch_id']} ({$b['batch_name']}) at {$b['batch_location']}";
        } else {
            $status = "AMBIGUOUS MATCH";
            $details = count($matches) . " batches share name '{$batchName}' (IDs: $matchingBatchIds)";
        }
    }
    
    echo sprintf("%-11d | %-20s | %-32s | %-19s | %-16s | %s\n", 
        $s['student_id'], 
        $s['student_name'], 
        $s['batch_name'] ?? 'NULL', 
        $matchingBatchIds ?: 'None', 
        $status, 
        $details
    );
}
