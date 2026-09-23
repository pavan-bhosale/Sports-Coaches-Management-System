<?php
// ============================================================================
// 1. LOCALHOST DEVELOPMENT (Commented out for Hostinger deployment)
// Uncomment the block below and comment out the Hostinger block when working on localhost:
// ============================================================================
/*
$host = 'localhost';
$dbname = 'vava_sports';
$username = 'root';
$password = '';
*/

// ============================================================================
// 2. HOSTINGER PRODUCTION DATABASE CONFIGURATION
// ============================================================================
$host = 'localhost';
$dbname = 'u854506354_vavasports';
$username = 'u854506354_vavasports';
$password = 'Vava@456';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}
?>
