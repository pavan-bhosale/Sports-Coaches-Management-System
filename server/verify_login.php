<?php
/**
 * VAVA Sports Academy - Google Auth Verification & Identity Resolution Endpoint
 * 
 * Verifies Google ID tokens, resolves centralized user identity via vsa_users,
 * validates requested roles against vsa_user_roles, and establishes authoritative PHP sessions.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_helper.php';
require_once __DIR__ . '/db_connect.php';

// Dynamic CORS configuration matching auth_helper.php
applyCorsHeaders('POST, OPTIONS');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Read and parse JSON request body
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
$idToken = $input['token'] ?? null;
$requestedRoleInput = strtolower(trim($input['role'] ?? 'admin'));

// Normalize requested role alias
if ($requestedRoleInput === 'superadmin' || $requestedRoleInput === 'super admin' || empty($requestedRoleInput)) {
    $requestedRole = 'admin';
} else {
    $requestedRole = $requestedRoleInput;
}

if (!in_array($requestedRole, ['admin', 'coach', 'student'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid role specified']);
    exit;
}

if (!$idToken) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No token provided']);
    exit;
}

// Verify Google ID token using Google's tokeninfo service
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
    echo json_encode(['success' => false, 'error' => 'Unable to reach Google authentication service']);
    exit;
}

$payload = json_decode($response, true);

// Validate token payload and Google Client ID audience from configuration
$googleConfig = getGoogleConfig();
$expectedClientId = $googleConfig['client_id'];

if (isset($payload['error']) || !isset($payload['email']) || ($payload['aud'] ?? '') !== $expectedClientId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Invalid or expired Google token']);
    exit;
}

$email     = strtolower(trim($payload['email']));
$name      = $payload['name'] ?? $payload['email'];
$googleSub = $payload['sub'] ?? null;

// ============================================================================
// CENTRALIZED IDENTITY RESOLUTION (vsa_users & vsa_user_roles)
// ============================================================================

// 1. Resolve unified identity from vsa_users
$userStmt = $pdo->prepare("SELECT user_id, email, display_name, google_subject_id, status FROM vsa_users WHERE email = ? LIMIT 1");
$userStmt->execute([$email]);
$unifiedUser = $userStmt->fetch(PDO::FETCH_ASSOC);

if (!$unifiedUser) {
    // Attempt fallback lookup directly against entity tables in case migration hasn't run or new user added
    $fallbackAdmin = $pdo->prepare("SELECT admin_id FROM vsa_superadmin WHERE LOWER(TRIM(REPLACE(REPLACE(admin_email, '\r', ''), '\n', ''))) = ? LIMIT 1");
    $fallbackAdmin->execute([$email]);
    $isAdmin = (bool)$fallbackAdmin->fetch();

    $fallbackCoach = $pdo->prepare("SELECT coach_id FROM vsa_coaches WHERE LOWER(TRIM(coach_email)) = ? LIMIT 1");
    $fallbackCoach->execute([$email]);
    $isCoach = (bool)$fallbackCoach->fetch();

    $fallbackStudent = $pdo->prepare("SELECT student_id FROM vsa_students WHERE LOWER(TRIM(student_email)) = ? LIMIT 1");
    $fallbackStudent->execute([$email]);
    $isStudent = (bool)$fallbackStudent->fetch();

    if (!$isAdmin && !$isCoach && !$isStudent) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => "You aren't a verified user."]);
        exit;
    }

    // Auto-sync into vsa_users if entity exists
    require_once __DIR__ . '/migrate_identity.php';
    $userStmt->execute([$email]);
    $unifiedUser = $userStmt->fetch(PDO::FETCH_ASSOC);
}

if (!$unifiedUser) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => "You aren't a verified user."]);
    exit;
}

if (($unifiedUser['status'] ?? 'Active') !== 'Active') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Your account is deactivated. Please contact an administrator.']);
    exit;
}

// Update Google Subject ID if not already saved
if ($googleSub && empty($unifiedUser['google_subject_id'])) {
    try {
        $updateSubStmt = $pdo->prepare("UPDATE vsa_users SET google_subject_id = ? WHERE user_id = ? AND google_subject_id IS NULL");
        $updateSubStmt->execute([$googleSub, $unifiedUser['user_id']]);
    } catch (Exception $e) {
        // Ignore duplicate key collision on subject id
    }
}

// 2. Fetch all authorized application roles for this user
$rolesStmt = $pdo->prepare("SELECT role, entity_id, is_primary FROM vsa_user_roles WHERE user_id = ?");
$rolesStmt->execute([$unifiedUser['user_id']]);
$userRoles = [];
while ($r = $rolesStmt->fetch(PDO::FETCH_ASSOC)) {
    $userRoles[$r['role']] = [
        'entity_id'  => (int)$r['entity_id'],
        'is_primary' => (int)$r['is_primary']
    ];
}

if (empty($userRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No authorized roles found for this account.']);
    exit;
}

// 3. Validate requested role against user's actual authorized roles
if (!isset($userRoles[$requestedRole])) {
    http_response_code(403);
    $displayRoleName = ($requestedRole === 'admin') ? 'Super Admin' : ucfirst($requestedRole);
    echo json_encode([
        'success' => false,
        'error'   => "Access denied. Your account is not authorized to sign in as a {$displayRoleName}."
    ]);
    exit;
}

$resolvedRole = $requestedRole;
$targetId     = $userRoles[$requestedRole]['entity_id'];

// 4. Retrieve specific entity record
$entityRecord = null;
if ($resolvedRole === 'admin') {
    $stmt = $pdo->prepare("SELECT * FROM vsa_superadmin WHERE admin_id = ? LIMIT 1");
    $stmt->execute([$targetId]);
    $entityRecord = $stmt->fetch(PDO::FETCH_ASSOC);
} elseif ($resolvedRole === 'coach') {
    $stmt = $pdo->prepare("
        SELECT c.*, COALESCE(NULLIF(c.batch_name, ''), b.batch_name, 'Unassigned') AS batch_name
        FROM vsa_coaches c
        LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
        WHERE c.coach_id = ? LIMIT 1
    ");
    $stmt->execute([$targetId]);
    $entityRecord = $stmt->fetch(PDO::FETCH_ASSOC);
} elseif ($resolvedRole === 'student') {
    $stmt = $pdo->prepare("SELECT * FROM vsa_students WHERE student_id = ? LIMIT 1");
    $stmt->execute([$targetId]);
    $entityRecord = $stmt->fetch(PDO::FETCH_ASSOC);
}

if (!$entityRecord) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => "Entity record for authorized role not found."]);
    exit;
}

// 5. Build user response payload
$userData = [
    'user_id' => (int)$unifiedUser['user_id'],
    'email'   => $email,
    'name'    => $name,
    'role'    => $resolvedRole
];

if (!empty($payload['picture'])) {
    $userData['picture'] = $payload['picture'];
}

if ($resolvedRole === 'coach') {
    $userData['coach_id']   = $targetId;
    $userData['coach_name'] = $entityRecord['coach_name'] ?? $name;
    $userData['batch_id']   = intval($entityRecord['batch_id'] ?? 0);
    $userData['batch_name'] = $entityRecord['batch_name'] ?? 'Unassigned';
    if (!empty($entityRecord['coach_photo'])) {
        $userData['coach_photo'] = $entityRecord['coach_photo'];
    }
} elseif ($resolvedRole === 'student') {
    $userData['student_id']   = $targetId;
    $userData['student_name'] = $entityRecord['student_name'] ?? $name;
    if (!empty($entityRecord['student_photo'])) {
        $userData['student_photo'] = $entityRecord['student_photo'];
    }
} else {
    $userData['admin_id'] = $targetId;
}

// 6. Establish authoritative PHP session
startSecureSession();

// Clear any stale session data
$_SESSION = [];

// Regenerate session ID to prevent session fixation attacks
if (function_exists('session_regenerate_id')) {
    @session_regenerate_id(true);
}

$_SESSION['user_id']    = (int)$unifiedUser['user_id'];
$_SESSION['user_role']  = $resolvedRole;
$_SESSION['user_email'] = $email;
$_SESSION['user_name']  = $name;

if ($resolvedRole === 'coach') {
    $_SESSION['coach_id'] = $targetId;
    unset($_SESSION['admin_id'], $_SESSION['student_id']);
} elseif ($resolvedRole === 'student') {
    $_SESSION['student_id'] = $targetId;
    unset($_SESSION['admin_id'], $_SESSION['coach_id']);
} else {
    $_SESSION['admin_id'] = $targetId;
    unset($_SESSION['coach_id'], $_SESSION['student_id']);
}

// 7. Activity Logging
require_once __DIR__ . '/activity_logger.php';

logActivity($pdo, [
    'actor_role'  => $resolvedRole,
    'actor_id'    => $targetId,
    'actor_name'  => $name,
    'actor_email' => $email,
    'module'      => 'AUTH',
    'action_type' => 'Logged In',
    'target_type' => 'User',
    'target_id'   => $targetId,
    'target_name' => $name,
    'description' => "{$name} logged in successfully as " . ($resolvedRole === 'admin' ? 'Super Admin' : ucfirst($resolvedRole)),
    'details'     => ['role' => $resolvedRole, 'email' => $email, 'user_id' => (int)$unifiedUser['user_id']]
]);

echo json_encode([
    'success' => true,
    'user'    => $userData
]);
?>
