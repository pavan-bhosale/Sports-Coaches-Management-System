<?php
require_once 'server/db_connect.php';

echo "=== vsa_batch_coaches DETAILS ===" . PHP_EOL;
$stmt = $pdo->query("SHOW CREATE TABLE vsa_batch_coaches");
$row = $stmt->fetch(PDO::FETCH_ASSOC);
echo $row['Create Table'] . PHP_EOL . PHP_EOL;

echo "=== ALL ROWS IN vsa_batch_coaches ===" . PHP_EOL;
$stmt = $pdo->query("SELECT bc.*, b.batch_name, c.coach_name 
                     FROM vsa_batch_coaches bc 
                     LEFT JOIN vsa_batches b ON bc.batch_id = b.batch_id 
                     LEFT JOIN vsa_coaches c ON bc.coach_id = c.coach_id");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "Count: " . count($rows) . PHP_EOL;
foreach ($rows as $r) {
    echo "ID: {$r['id']} | Batch ID: {$r['batch_id']} ({$r['batch_name']}) | Coach ID: {$r['coach_id']} ({$r['coach_name']}) | Created: {$r['created_at']}" . PHP_EOL;
}

echo PHP_EOL . "=== vsa_batches CURRENT coach_id ASSIGNMENTS ===" . PHP_EOL;
$stmt = $pdo->query("SELECT b.batch_id, b.batch_name, b.coach_id, c.coach_name 
                     FROM vsa_batches b 
                     LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id 
                     ORDER BY b.batch_id ASC");
$batches = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "Total batches: " . count($batches) . PHP_EOL;
foreach ($batches as $b) {
    echo "Batch ID: {$b['batch_id']} | Name: {$b['batch_name']} | Coach ID: " . ($b['coach_id'] ?? 'NULL') . " (" . ($b['coach_name'] ?? 'No Coach') . ")" . PHP_EOL;
}
