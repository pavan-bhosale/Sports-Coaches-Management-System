<?php
require_once __DIR__ . '/../server/db_connect.php';
$stmt = $pdo->query('SELECT activity_id, created_at, actor_name, actor_role, module, action_type, description FROM vsa_activity_log ORDER BY activity_id DESC');
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
    echo "#{$r['activity_id']} [{$r['created_at']}] [{$r['module']}] [{$r['action_type']}] {$r['actor_name']} ({$r['actor_role']}): {$r['description']}\n";
}
