<?php
require_once __DIR__ . '/../server/db_connect.php';
$tables = ['vsa_students', 'vsa_coaches', 'vsa_batches', 'vsa_attendance', 'vsa_student_fees', 'vsa_payment_notifications', 'vsa_inventory', 'vsa_superadmin'];
foreach ($tables as $t) {
    $c = $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    echo "$t: $c rows\n";
}
