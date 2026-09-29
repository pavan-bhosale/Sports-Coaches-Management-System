<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== vsa_students schema ===\n";
$st = $pdo->query('DESCRIBE vsa_students');
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $c) {
    echo "{$c['Field']} ({$c['Type']}) Null={$c['Null']} Default=" . json_encode($c['Default']) . "\n";
}

echo "\n=== vsa_batches schema ===\n";
$bt = $pdo->query('DESCRIBE vsa_batches');
foreach ($bt->fetchAll(PDO::FETCH_ASSOC) as $c) {
    echo "{$c['Field']} ({$c['Type']}) Null={$c['Null']} Default=" . json_encode($c['Default']) . "\n";
}

echo "\n=== vsa_coaches schema ===\n";
$ct = $pdo->query('DESCRIBE vsa_coaches');
foreach ($ct->fetchAll(PDO::FETCH_ASSOC) as $c) {
    echo "{$c['Field']} ({$c['Type']}) Null={$c['Null']} Default=" . json_encode($c['Default']) . "\n";
}
