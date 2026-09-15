<?php
require_once 'server/db_connect.php';
echo "=== vsa_superadmin ===\n";
print_r($pdo->query('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin')->fetchAll());
