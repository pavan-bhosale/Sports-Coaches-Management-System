<?php
require_once __DIR__ . '/../server/db_connect.php';
$c = $pdo->query('SELECT COUNT(*) FROM vsa_activity_log')->fetchColumn();
echo "Total vsa_activity_log records: $c\n";

$roles = $pdo->query('SELECT actor_role, COUNT(*) c FROM vsa_activity_log GROUP BY actor_role')->fetchAll(PDO::FETCH_ASSOC);
echo "By role: " . json_encode($roles) . "\n";

$modules = $pdo->query('SELECT module, COUNT(*) c FROM vsa_activity_log GROUP BY module')->fetchAll(PDO::FETCH_ASSOC);
echo "By module: " . json_encode($modules) . "\n";

$actions = $pdo->query('SELECT action_type, COUNT(*) c FROM vsa_activity_log GROUP BY action_type')->fetchAll(PDO::FETCH_ASSOC);
echo "By action: " . json_encode($actions) . "\n";

$sample = $pdo->query('SELECT activity_id, actor_name, actor_role, module, action_type, target_name, description, details, created_at FROM vsa_activity_log ORDER BY activity_id DESC LIMIT 3')->fetchAll(PDO::FETCH_ASSOC);
echo "Sample records: " . json_encode($sample, JSON_PRETTY_PRINT) . "\n";
