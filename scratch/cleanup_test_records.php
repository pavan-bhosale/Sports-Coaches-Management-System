<?php
require_once 'server/db_connect.php';
$deleted = $pdo->exec("DELETE FROM vsa_student_fees WHERE fee_month = '2026-10-01'");
echo "Cleaned up $deleted October test records.\n";
