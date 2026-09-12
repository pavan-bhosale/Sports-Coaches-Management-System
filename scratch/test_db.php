<?php
require_once 'server/db_connect.php';

echo "=== vsa_superadmin ===\n";
foreach ($pdo->query("SELECT * FROM vsa_superadmin") as $r) {
    print_r($r);
}

echo "=== vsa_coaches sample ===\n";
foreach ($pdo->query("SELECT coach_id, coach_name, coach_email FROM vsa_coaches LIMIT 2") as $r) {
    print_r($r);
}

echo "=== vsa_students sample ===\n";
foreach ($pdo->query("SELECT student_id, student_name, student_email FROM vsa_students LIMIT 2") as $r) {
    print_r($r);
}

?>
