<?php
require_once __DIR__ . '/../server/db_connect.php';

try {
    echo "=== STEP 1: PRE-DROP DATA CHECK ===\n";
    $table_check = $pdo->query("SHOW TABLES LIKE 'vsa_batch_coaches'")->fetch();
    if ($table_check) {
        $vbc_stmt = $pdo->query("SELECT * FROM vsa_batch_coaches ORDER BY batch_id");
        $vbc_rows = $vbc_stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "Current vsa_batch_coaches rows count: " . count($vbc_rows) . "\n";
        foreach ($vbc_rows as $row) {
            $b_stmt = $pdo->prepare("SELECT batch_id, batch_name, coach_id FROM vsa_batches WHERE batch_id = ?");
            $b_stmt->execute([$row['batch_id']]);
            $batch = $b_stmt->fetch(PDO::FETCH_ASSOC);
            echo "Row: Batch {$row['batch_id']} Coach {$row['coach_id']} => in vsa_batches: batch_name='{$batch['batch_name']}', coach_id='{$batch['coach_id']}'\n";
            if ($batch['coach_id'] != $row['coach_id']) {
                throw new Exception("Mismatch detected! Batch {$row['batch_id']} in vsa_batches has coach_id {$batch['coach_id']}, expected {$row['coach_id']}");
            }
        }
        echo "All vsa_batch_coaches rows are 100% identically matched in vsa_batches.coach_id!\n\n";

        echo "=== STEP 2: DROPPING vsa_batch_coaches ===\n";
        $pdo->exec("DROP TABLE IF EXISTS vsa_batch_coaches");
        echo "DROP TABLE IF EXISTS vsa_batch_coaches executed successfully.\n\n";
    } else {
        echo "Table vsa_batch_coaches is ALREADY DROPPED from previous step.\n\n";
    }

    echo "=== STEP 3: POST-DROP VERIFICATION ===\n";
    $check_stmt = $pdo->query("SHOW TABLES LIKE 'vsa_batch_coaches'");
    $exists = $check_stmt->fetch();
    if ($exists) {
        throw new Exception("Table vsa_batch_coaches still exists!");
    } else {
        echo "CONFIRMED: Table vsa_batch_coaches no longer exists in database 'vava_sports'.\n";
    }

    echo "\n=== STEP 4: VERIFY vsa_batches.coach_id INTEGRITY ===\n";
    $b_check = $pdo->query("SELECT b.batch_id, b.batch_name, b.batch_time, b.coach_id, c.coach_name 
                            FROM vsa_batches b 
                            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id 
                            ORDER BY b.batch_id");
    $all_batches = $b_check->fetchAll(PDO::FETCH_ASSOC);
    echo "Total batches: " . count($all_batches) . "\n";
    foreach ($all_batches as $b) {
        $c_name = $b['coach_name'] ?? 'NONE';
        echo "- Batch {$b['batch_id']} ({$b['batch_name']}) => Coach ID: {$b['coach_id']} ({$c_name})\n";
    }

    echo "\nCleanup script finished successfully.\n";

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
