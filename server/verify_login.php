<?php
/**
 * VAVA Sports Academy - Google Auth Verification Endpoint
 * 
 * Receives the Google ID token from the frontend,
 * verifies it with Google, extracts the email,
 * and checks the appropriate table based on the login role.
 */

// Dynamic CORS configuration allowing localhost/127.0.0.1 development origins with credentials
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

if (in_array($origin, $allowedOrigins) || preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/', $origin)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-VAVA-Role, X-VAVA-Email');

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
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
$idToken = $input['token'] ?? null;
$role    = strtolower(trim($input['role'] ?? 'admin'));

if (!$idToken) {
    http_response_code(400);
    echo json_encode(['error' => 'No token provided']);
    exit;
}

// Verify the Google ID token using Google's tokeninfo endpoint
$verifyUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);
$context = stream_context_create([
    'http' => [
        'ignore_errors' => true,
        'timeout'       => 10
    ]
]);
$response = @file_get_contents($verifyUrl, false, $context);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Unable to reach Google authentication service']);
    exit;
}

$payload = json_decode($response, true);

// Validate the token payload
$expectedClientId = '773475002367-kfmlifn4bn181tdlts94ss2q2jmisdaa.apps.googleusercontent.com';
if (isset($payload['error']) || !isset($payload['email']) || ($payload['aud'] ?? '') !== $expectedClientId) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid or expired Google token']);
    exit;
}

$email = strtolower(trim($payload['email']));
$name  = $payload['name'] ?? $payload['email'];

// Determine which table and column to check based on role
if ($role === 'coach') {
    $stmt = $pdo->prepare('SELECT * FROM vsa_coaches WHERE LOWER(TRIM(coach_email)) = ?');
} elseif ($role === 'student') {
    $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE LOWER(TRIM(student_email)) = ?');
} else {
    // Default: superadmin
    $stmt = $pdo->prepare("SELECT * FROM vsa_superadmin WHERE LOWER(TRIM(REPLACE(REPLACE(admin_email, '\r', ''), '\n', ''))) = ?");
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

$targetId = null;
if ($role === 'coach') {
    $targetId = intval($verifiedUser['coach_id'] ?? 0);
    $userData['coach_id']   = $targetId;
    $userData['coach_name'] = $verifiedUser['coach_name'] ?? $name;
    $userData['batch_id']   = intval($verifiedUser['batch_id'] ?? 0);
    $userData['batch_name'] = $verifiedUser['batch_name'] ?? 'Unassigned';
    if (!empty($verifiedUser['coach_photo'])) {
        $userData['coach_photo'] = $verifiedUser['coach_photo'];
    }
} elseif ($role === 'student') {
    $targetId = intval($verifiedUser['student_id'] ?? 0);
    $userData['student_id']   = $targetId;
    $userData['student_name'] = $verifiedUser['student_name'] ?? $name;
    if (!empty($verifiedUser['student_photo'])) {
        $userData['student_photo'] = $verifiedUser['student_photo'];
    }
} else {
    $targetId = intval($verifiedUser['admin_id'] ?? 0);
    $userData['admin_id'] = $targetId;
}

// Establish PHP session for state persistence
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$_SESSION['user_role']  = $role;
$_SESSION['user_email'] = $email;
$_SESSION['user_name']  = $name;
if ($role === 'coach') {
    $_SESSION['coach_id'] = $targetId;
} elseif ($role === 'student') {
    $_SESSION['student_id'] = $targetId;
} else {
    $_SESSION['admin_id'] = $targetId;
}

// Activity Logging for Successful Login
require_once __DIR__ . '/activity_logger.php';

logActivity($pdo, [
    'actor_role'  => $role,
    'actor_id'    => $targetId,
    'actor_name'  => $name,
    'actor_email' => $email,
    'module'      => 'AUTH',
    'action_type' => 'Logged In',
    'target_type' => 'User',
    'target_id'   => $targetId,
    'target_name' => $name,
    'description' => "{$name} logged in successfully as " . ucfirst($role),
    'details'     => ['role' => $role, 'email' => $email]
]);

echo json_encode([
    'success' => true,
    'user'    => $userData
]);
?>
