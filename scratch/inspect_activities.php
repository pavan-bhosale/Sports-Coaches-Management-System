<?php
require_once __DIR__ . '/../server/db_connect.php';

$st = $pdo->query('SELECT activity_id, actor_name, actor_role, actor_id, actor_email, module, action_type, target_name, description FROM vsa_activity_log ORDER BY activity_id');
$rows = $st->fetchAll(PDO::FETCH_ASSOC);

echo "Total rows: " . count($rows) . "\n";
foreach ($rows as $r) {
    echo "ID: {$r['activity_id']} | Actor: {$r['actor_name']} ({$r['actor_role']}, ID:{$r['actor_id']}, Email:{$r['actor_email']}) | Mod: {$r['module']} | Act: {$r['action_type']} | Target: {$r['target_name']} | Desc: {$r['description']}\n";
}
