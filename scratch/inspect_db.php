<?php
require_once __DIR__ . '/../server/db_connect.php';

function showCols($pdo, $table) {
    echo "--- Table: $table ---\n";
    $cols = $pdo->query("DESCRIBE $table")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $col) {
        echo "{$col['Field']} ({$col['Type']}) " . ($col['Null'] === 'YES' ? 'NULL' : 'NOT NULL') . " Key:{$col['Key']} Default:{$col['Default']}\n";
    }
}

showCols($pdo, 'vsa_superadmin');
showCols($pdo, 'vsa_coaches');
showCols($pdo, 'vsa_students');
showCols($pdo, 'vsa_batches');
showCols($pdo, 'vsa_attendance');
showCols($pdo, 'vsa_student_fees');
