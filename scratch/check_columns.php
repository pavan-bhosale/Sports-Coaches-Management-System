<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== vsa_coaches ===\n";
$cols = $pdo->query("DESCRIBE vsa_coaches")->fetchAll(PDO::FETCH_ASSOC);
foreach ($cols as $c) echo $c['Field'] . "\n";

echo "\n=== vsa_inventory ===\n";
try {
    $cols = $pdo->query("DESCRIBE vsa_inventory")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $c) echo $c['Field'] . "\n";
} catch (Exception $e) { echo $e->getMessage() . "\n"; }

echo "\n=== vsa_inventory_movement ===\n";
try {
    $cols = $pdo->query("DESCRIBE vsa_inventory_movement")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $c) echo $c['Field'] . "\n";
} catch (Exception $e) { echo $e->getMessage() . "\n"; }
