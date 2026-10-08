<?php
/**
 * Test helper: Sets up an authoritative PHP session simulating verified Google login
 */
require_once dirname(__DIR__) . '/server/auth_helper.php';
require_once dirname(__DIR__) . '/server/db_connect.php';

startSecureSession();

$role  = strtolower(trim($_GET['role'] ?? 'admin'));
$email = strtolower(trim($_GET['email'] ?? ''));
$id    = intval($_GET['id'] ?? 0);
$name  = $_GET['name'] ?? '';

if (empty($email)) {
    if ($role === 'coach') {
        $cRow = $pdo->query("SELECT coach_id, coach_email, coach_name FROM vsa_coaches LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $email = $cRow['coach_email'];
        $id = intval($cRow['coach_id']);
        if (!$name) $name = $cRow['coach_name'];
    } elseif ($role === 'student') {
        $sRow = $pdo->query("SELECT student_id, student_email, student_name FROM vsa_students LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $email = $sRow['student_email'];
        $id = intval($sRow['student_id']);
        if (!$name) $name = $sRow['student_name'];
    } else {
        $aRow = $pdo->query("SELECT admin_id, admin_email, admin_name FROM vsa_superadmin LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $email = $aRow['admin_email'];
        $id = intval($aRow['admin_id']);
        if (!$name) $name = $aRow['admin_name'] ?: 'Super Admin';
    }
}

// Resolve user_id from vsa_users
$userId = 0;
if (!empty($email)) {
    try {
        $uStmt = $pdo->prepare("SELECT user_id FROM vsa_users WHERE email = ? LIMIT 1");
        $uStmt->execute([$email]);
        $userId = intval($uStmt->fetchColumn() ?: 0);
    } catch (Exception $e) {
        $userId = 0;
    }
}

$_SESSION = [];
if (function_exists('session_regenerate_id')) {
    @session_regenerate_id(true);
}

$_SESSION['user_id']    = $userId;
$_SESSION['user_role']  = $role;
$_SESSION['user_email'] = $email;
$_SESSION['user_name']  = $name;

if ($role === 'coach') {
    $_SESSION['coach_id'] = $id;
} elseif ($role === 'student') {
    $_SESSION['student_id'] = $id;
} else {
    $_SESSION['admin_id'] = $id;
}

header('Content-Type: application/json');
echo json_encode([
    'session_id' => session_id(),
    'user_id'    => $userId,
    'role'       => $role,
    'email'      => $email,
    'id'         => $id
]);
?>
