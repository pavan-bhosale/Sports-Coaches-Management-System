<?php
require 'server/db_connect.php';
$students = $pdo->query('SELECT student_id, student_name, student_email, batch_id, coach_id FROM vsa_students LIMIT 10')->fetchAll(PDO::FETCH_ASSOC);
print_r($students);
