<?php
require_once __DIR__ . '/../server/db_connect.php';
echo "=== vsa_students ===\n";
foreach ($pdo->query("DESCRIBE vsa_students")->fetchAll(PDO::FETCH_ASSOC) as $c) echo $c['Field'] . "\n";

echo "\n=== vsa_batches ===\n";
foreach ($pdo->query("DESCRIBE vsa_batches")->fetchAll(PDO::FETCH_ASSOC) as $c) echo $c['Field'] . "\n";
