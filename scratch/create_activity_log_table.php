<?php
require_once __DIR__ . '/../server/db_connect.php';

$sql = "
CREATE TABLE IF NOT EXISTS vsa_activity_log (
    activity_id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_name VARCHAR(100) NULL,
    actor_email VARCHAR(100) NULL,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'superadmin',
    module VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NULL,
    target_id INT NULL,
    target_name VARCHAR(150) NULL,
    description TEXT NOT NULL,
    details JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at DESC),
    INDEX idx_module (module),
    INDEX idx_actor_role (actor_role),
    INDEX idx_action_type (action_type),
    INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";

try {
    $pdo->exec($sql);
    echo "SUCCESS: vsa_activity_log table created or already exists.\n";
    
    // Check columns
    $stmt = $pdo->query("SHOW COLUMNS FROM vsa_activity_log");
    echo "Columns in vsa_activity_log:\n";
    while ($row = $stmt->fetch()) {
        echo "- {$row['Field']} ({$row['Type']})\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
