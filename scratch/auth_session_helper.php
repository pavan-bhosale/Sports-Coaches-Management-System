<?php
/**
 * Test helper: Sets up a PHP session simulating verified Google login
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$role  = $_GET['role'] ?? 'admin';
$email = $_GET['email'] ?? '';
$id    = intval($_GET['id'] ?? 0);
$name  = $_GET['name'] ?? 'Test User';

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
    'role'       => $role,
    'email'      => $email,
    'id'         => $id
]);
