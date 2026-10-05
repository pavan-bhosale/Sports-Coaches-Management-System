<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== SUPER ADMIN ===\n";
print_r($pdo->query('SELECT * FROM vsa_superadmin')->fetchAll(PDO::FETCH_ASSOC));
