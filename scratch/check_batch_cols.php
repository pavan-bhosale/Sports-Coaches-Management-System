<?php
require_once __DIR__ . '/../server/db_connect.php';
echo "=== vsa_students ===\n";
foreach ($pdo->query("DESCRIBE vsa_students")->fetchAll(PDO::FETCH_ASSOC) as $c) echo $c['Field'] . "\n";

echo "\n=== sample batch ===\n";
print_r($pdo->query("SELECT * FROM vsa_batches LIMIT 1")->fetch(PDO::FETCH_ASSOC));
