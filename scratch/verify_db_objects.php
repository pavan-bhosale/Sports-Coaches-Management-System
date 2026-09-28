<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== SHOW TABLES ===\n";
$tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
print_r($tables);

echo "\n=== CHECK ANY OBJECTS REFERENCING vsa_batch_coaches ===\n";
$fk_check = $pdo->query("SELECT * FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME = 'vsa_batch_coaches' OR TABLE_NAME = 'vsa_batch_coaches'")->fetchAll(PDO::FETCH_ASSOC);
echo "FK references count: " . count($fk_check) . "\n";

$triggers = $pdo->query("SELECT * FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_TABLE = 'vsa_batch_coaches'")->fetchAll(PDO::FETCH_ASSOC);
echo "Triggers count: " . count($triggers) . "\n";

$views = $pdo->query("SELECT * FROM information_schema.VIEWS WHERE TABLE_SCHEMA = 'vava_sports' AND TABLE_NAME = 'vsa_batch_coaches'")->fetchAll(PDO::FETCH_ASSOC);
echo "Views count: " . count($views) . "\n";
