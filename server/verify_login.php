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
    $stmt = $pdo->prepare('SELECT * FROM vsa_coaches WHERE coach_email = ?');
} elseif ($role === 'student') {
    $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE student_email = ?');
} else {
    // Default: superadmin
    $stmt = $pdo->prepare('SELECT * FROM vsa_superadmin WHERE admin_email = ?');
}

$stmt->execute([$email]);
$verifiedUser = $stmt->fetch();

if (!$verifiedUser) {
    http_response_code(403);
    echo json_encode(['error' => "You aren't a verified user."]);
    exit;
}

// User is verified — build user payload
$userData = [
    'email' => $email,
    'name'  => $name,
    'role'  => $role
];

if (!empty($payload['picture'])) {
    $userData['picture'] = $payload['picture'];
}

if ($role === 'coach' && $verifiedUser) {
    $userData['coach_id']   = intval($verifiedUser['coach_id'] ?? 0);
    $userData['coach_name'] = $verifiedUser['coach_name'] ?? $name;
    $userData['batch_id']   = intval($verifiedUser['batch_id'] ?? 0);
    $userData['batch_name'] = $verifiedUser['batch_name'] ?? 'Unassigned';
    if (!empty($verifiedUser['coach_photo'])) {
        $userData['coach_photo'] = $verifiedUser['coach_photo'];
    }
} elseif ($role === 'student' && $verifiedUser) {
    $userData['student_id']   = intval($verifiedUser['student_id'] ?? 0);
    $userData['student_name'] = $verifiedUser['student_name'] ?? $name;
    if (!empty($verifiedUser['student_photo'])) {
        $userData['student_photo'] = $verifiedUser['student_photo'];
    }
}

echo json_encode([
    'success' => true,
    'user'    => $userData
]);
?>
