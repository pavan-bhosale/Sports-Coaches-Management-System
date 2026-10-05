<?php
session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION['user_role'] = $_POST['role'] ?? '';
    $_SESSION['user_email'] = $_POST['email'] ?? '';
    $_SESSION['student_id'] = intval($_POST['student_id'] ?? 0);
    $_SESSION['coach_id'] = intval($_POST['coach_id'] ?? 0);
    echo json_encode(['success' => true, 'session' => $_SESSION]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['session' => $_SESSION]);
    exit;
}
