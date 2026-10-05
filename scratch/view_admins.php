<?php
require 'server/db_connect.php';
$admins = $pdo->query('SELECT * FROM vsa_superadmin')->fetchAll(PDO::FETCH_ASSOC);
echo "ADMINS:\n";
print_r($admins);
