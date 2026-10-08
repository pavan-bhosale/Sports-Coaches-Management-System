<?php
require_once __DIR__ . '/config.php';

$dbConfig = getDbConfig();
$host     = $dbConfig['host'];
$dbname   = $dbConfig['dbname'];
$username = $dbConfig['username'];
$password = $dbConfig['password'];
$charset  = $dbConfig['charset'] ?? 'utf8mb4';

try {
    $pdo = new PDO("mysql:host={$host};dbname={$dbname};charset={$charset}", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    // Never leak database credentials or internal connection strings
    echo json_encode(['error' => 'Database connection failed. Please check server configuration.']);
    exit;
}
?>
