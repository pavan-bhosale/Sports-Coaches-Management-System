<?php
require_once 'server/db_connect.php';

echo "=== vsa_student_fees ===\n";
foreach ($pdo->query("DESCRIBE vsa_student_fees") as $row) {
    echo "{$row['Field']} - {$row['Type']} - {$row['Null']} - {$row['Key']}\n";
}

echo "\n=== vsa_students ===\n";
foreach ($pdo->query("DESCRIBE vsa_students") as $row) {
    echo "{$row['Field']} - {$row['Type']}\n";
}

echo "\n=== vsa_batches ===\n";
foreach ($pdo->query("DESCRIBE vsa_batches") as $row) {
    echo "{$row['Field']} - {$row['Type']}\n";
}

echo "\n=== vsa_student_fees record count for 2026-09-01 ===\n";
$stmt = $pdo->query("SELECT COUNT(*) FROM vsa_student_fees WHERE fee_month = '2026-09-01'");
echo "Count: " . $stmt->fetchColumn() . "\n";

?>
