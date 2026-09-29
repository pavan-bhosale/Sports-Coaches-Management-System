<?php
require_once __DIR__ . '/../server/db_connect.php';

$tables = ['vsa_students', 'vsa_batches', 'vsa_coaches', 'vsa_attendance', 'vsa_student_fees', 'vsa_inventory'];
foreach ($tables as $t) {
    $c = $pdo->query("SELECT COUNT(*) FROM {$t}")->fetchColumn();
    echo "{$t}: {$c}\n";
}

// Sample a student row
$s = $pdo->query("SELECT * FROM vsa_students LIMIT 1")->fetch(PDO::FETCH_ASSOC);
echo "Sample student: " . json_encode($s) . "\n";

// Sample a batch row
$b = $pdo->query("SELECT * FROM vsa_batches LIMIT 1")->fetch(PDO::FETCH_ASSOC);
echo "Sample batch: " . json_encode($b) . "\n";
