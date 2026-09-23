<?php
// ============================================================================
// AUTOMATIC ENVIRONMENT DETECTION & DATABASE CONFIGURATION
// Automatically selects Localhost/XAMPP or Hostinger Production based on request.
// ============================================================================

$isLocal = false;
$httpHost = strtolower($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');

if (!empty($httpHost)) {
    // 1. Web Server request (HTTP / HTTPS)
    $hostOnly = explode(':', $httpHost)[0];
    $isLocal = ($hostOnly === 'localhost' || $hostOnly === '127.0.0.1');
} elseif (php_sapi_name() === 'cli') {
    // 2. CLI / Background Worker Execution (fees_worker.php / cron jobs / test scripts)
    $envOverride = strtolower(getenv('APP_ENV') ?: (getenv('ENVIRONMENT') ?: ''));
    if ($envOverride === 'local' || $envOverride === 'development') {
        $isLocal = true;
    } elseif ($envOverride === 'production' || $envOverride === 'prod') {
        $isLocal = false;
    } elseif (stripos(__DIR__, 'u854506354') !== false || stripos(__DIR__, '/home/') !== false) {
        // Hostinger production Linux environment
        $isLocal = false;
    } else {
        // Local development environment (Windows / XAMPP)
        $isLocal = (PHP_OS_FAMILY === 'Windows');
    }
}

if ($isLocal) {
    // 1. LOCALHOST / XAMPP DATABASE CONFIGURATION
    $host     = 'localhost';
    $dbname   = 'vava_sports';
    $username = 'root';
    $password = '';
} else {
    // 2. HOSTINGER PRODUCTION DATABASE CONFIGURATION
    $host     = 'localhost';
    $dbname   = 'u854506354_vavasports';
    $username = 'u854506354_vavasports';
    $password = 'Vava@456';
}

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
