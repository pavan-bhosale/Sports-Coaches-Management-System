<?php
require_once __DIR__ . '/../server/db_connect.php';
$stmt = $pdo->query("DESCRIBE vsa_student_fees");
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $col) {
    echo "{$col['Field']} | {$col['Type']} | Null:{$col['Null']} | Default:{$col['Default']}\n";
}
