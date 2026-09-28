<?php
require_once __DIR__ . '/../server/db_connect.php';
$pdo->exec("DELETE FROM vsa_students WHERE student_name LIKE 'Automated Test Player%'");
echo "Done.\n";
