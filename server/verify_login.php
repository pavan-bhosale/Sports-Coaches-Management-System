<?php
/**
 * VAVA Sports Academy - Google Auth Verification Endpoint
 * 
 * Receives the Google ID token from the frontend,
 * verifies it with Google, extracts the email,
 * and checks the appropriate table based on the login role.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once 'db_connect.php';

// Read the JSON body
$input = json_decode(file_get_contents('php://input'), true);
$idToken = $input['token'] ?? null;
$role    = $input['role']  ?? 'admin';

if (!$idToken) {
    http_response_code(400);
    echo json_encode(['error' => 'No token provided']);
    exit;
}

// Verify the Google ID token using Google's tokeninfo endpoint
$verifyUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);
$response = file_get_contents($verifyUrl);

if ($response === false) {
    http_response_code(401);
    echo json_encode(['error' => 'Failed to verify Google token']);
    exit;
}

$payload = json_decode($response, true);

// Validate the token payload
$expectedClientId = '773475002367-kfmlifn4bn181tdlts94ss2q2jmisdaa.apps.googleusercontent.com';
if (!isset($payload['email']) || ($payload['aud'] ?? '') !== $expectedClientId) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid Google token']);
    exit;
}

$email = $payload['email'];
$name  = $payload['name'] ?? $payload['email'];

// Determine which table and column to check based on role
if ($role === 'coach') {
    $stmt = $pdo->prepare('SELECT * FROM coaches WHERE coach_email = ?');
} elseif ($role === 'student') {
    $stmt = $pdo->prepare('SELECT * FROM students WHERE student_email = ?');
} else {
    // Default: superadmin
    $stmt = $pdo->prepare('SELECT * FROM superadmin WHERE admin_email = ?');
}

$stmt->execute([$email]);
$verifiedUser = $stmt->fetch();

if (!$verifiedUser) {
    http_response_code(403);
    echo json_encode(['error' => "You aren't a verified user."]);
    exit;
}

// User is verified — return success
echo json_encode([
    'success' => true,
    'user' => [
        'email' => $email,
        'name'  => $name
    ]
]);
?>
