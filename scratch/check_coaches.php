<?php
require 'server/db_connect.php';
echo "--- SUPERADMIN ---\n";
$stmt = $pdo->query('SELECT admin_id, admin_name, admin_email, HEX(admin_email) as hex FROM vsa_superadmin');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

echo "--- STUDENTS ---\n";
$stmt = $pdo->query('SELECT student_id, student_name, student_email, HEX(student_email) as hex FROM vsa_students LIMIT 5');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
