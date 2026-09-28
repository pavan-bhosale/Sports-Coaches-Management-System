<?php
require_once __DIR__ . '/../server/db_connect.php';

// Check if coach_id column exists in vsa_batches
$stmt = $pdo->query("SHOW COLUMNS FROM vsa_batches LIKE 'coach_id'");
$col = $stmt->fetch();
if (!$col) {
    echo "Adding coach_id column to vsa_batches...\n";
    $pdo->exec("ALTER TABLE vsa_batches ADD COLUMN coach_id INT NULL DEFAULT NULL AFTER sport");
    $pdo->exec("ALTER TABLE vsa_batches ADD CONSTRAINT fk_batch_coach FOREIGN KEY (coach_id) REFERENCES vsa_coaches(coach_id) ON DELETE SET NULL");
    echo "Column coach_id added successfully.\n";

    // Migrate existing coach -> batch relationships from vsa_coaches.batch_id
    echo "Migrating existing coach batch_id links to vsa_batches.coach_id...\n";
    $coaches = $pdo->query("SELECT coach_id, batch_id FROM vsa_coaches WHERE batch_id IS NOT NULL AND batch_id > 0")->fetchAll();
    foreach ($coaches as $c) {
        $stmtUpdate = $pdo->prepare("UPDATE vsa_batches SET coach_id = ? WHERE batch_id = ?");
        $stmtUpdate->execute([$c['coach_id'], $c['batch_id']]);
        echo "Assigned Coach {$c['coach_id']} to Batch {$c['batch_id']}\n";
    }
} else {
    echo "Column coach_id already exists in vsa_batches.\n";
}

echo "\n--- VERIFICATION OF VSA_BATCHES WITH COACHES ---\n";
$batches = $pdo->query("
    SELECT b.batch_id, b.batch_name, b.batch_time, b.coach_id, c.coach_name 
    FROM vsa_batches b 
    LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
")->fetchAll(PDO::FETCH_ASSOC);
print_r($batches);
