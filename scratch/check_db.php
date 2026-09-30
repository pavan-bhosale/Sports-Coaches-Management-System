<?php
require_once __DIR__ . '/../server/db_connect.php';
$stmt = $pdo->query('SHOW TABLES');
echo "TABLES IN DATABASE:\n";
while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
    echo "- " . $row[0] . "\n";
}
