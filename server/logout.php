<?php
/**
 * VAVA Sports Academy - Logout Endpoint
 * Fully destroys the authenticated PHP session and clears session cookies.
 */

require_once __DIR__ . '/auth_helper.php';

applyCorsHeaders('GET, POST, OPTIONS');

startSecureSession();

// Clear all session variables
$_SESSION = [];

// Delete the session cookie if present
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        [
            'expires'  => time() - 42000,
            'path'     => $params["path"] ?: '/',
            'domain'   => $params["domain"],
            'secure'   => $params["secure"],
            'httponly' => $params["httponly"],
            'samesite' => 'Lax'
        ]
    );
}

// Destroy session on server
if (session_status() === PHP_SESSION_ACTIVE) {
    session_destroy();
}

echo json_encode([
    'success' => true,
    'message' => 'Logged out successfully.'
]);
?>
