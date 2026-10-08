<?php
/**
 * VAVA Sports Academy - Fees & Collections API
 * 
 * Handles real dynamic queries, idempotent monthly fee generation,
 * payment recording, scheduled notifications, and summary metrics calculation.
 */

date_default_timezone_set('Asia/Kolkata');

// ============================================================================
// DYNAMIC & SECURE CORS CONFIGURATION
// Supports Localhost/127.0.0.1 development, Live Server, and Hostinger Production.
// Strictly enforces exact origin reflection + credentials for approved origins.
// NEVER outputs wildcard (*) for credentialed requests.
// ============================================================================

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$httpHost = strtolower($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
$serverHostOnly = !empty($httpHost) ? explode(':', $httpHost)[0] : '';
$originHost = !empty($origin) ? strtolower(parse_url($origin, PHP_URL_HOST) ?? '') : '';

$allowedOrigins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'https://vavasports.com',
    'https://www.vavasports.com',
    'http://vavasports.com',
    'http://www.vavasports.com'
];

$isAllowedOrigin = false;
if (!empty($origin)) {
    if (in_array($origin, $allowedOrigins, true)) {
        $isAllowedOrigin = true;
    } elseif (preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i', $origin)) {
        $isAllowedOrigin = true;
    } elseif (preg_match('/^https?:\/\/([a-z0-9-]+\.)*vavasports\.com(:\d+)?$/i', $origin)) {
        $isAllowedOrigin = true;
    } elseif (preg_match('/^https?:\/\/([a-z0-9-]+\.)*(hostingersite\.com|hostingerapp\.com)(:\d+)?$/i', $origin)) {
        $isAllowedOrigin = true;
    } elseif (!empty($serverHostOnly) && !empty($originHost)) {
        if ($originHost === $serverHostOnly ||
            $originHost === 'www.' . $serverHostOnly ||
            'www.' . $originHost === $serverHostOnly) {
            $isAllowedOrigin = true;
        }
    }
}

header('Vary: Origin');
if ($isAllowedOrigin) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID, X-VAVA-Coach-Id, X-VAVA-Student-ID, X-VAVA-Student-Id, X-VAVA-Actor-Name, X-Requested-With, Accept, Origin');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    if ($isAllowedOrigin) {
        header('Access-Control-Max-Age: 86400');
        http_response_code(200);
    } else {
        http_response_code(403);
    }
    exit;
}

require_once 'db_connect.php';
require_once 'activity_logger.php';
require_once 'razorpay_config.php';
require_once 'twilio_config.php';
require_once 'fees_scheduler_service.php';

// Helper to normalize month string to YYYY-MM-01
function parseMonthParam($monthParam) {
    if (empty($monthParam)) {
        return date('Y-m-01');
    }
    $clean = trim($monthParam);
    // If format is "September 2026" or "2026-09" or "2026-09-01"
    $time = strtotime($clean);
    if ($time === false) {
        $time = strtotime("01 " . $clean);
    }
    if ($time === false) {
        return date('Y-m-01');
    }
    return date('Y-m-01', $time);
}

// ── Idempotent Monthly Fee Generator ─────────────────────────────────────────
function generateMonthlyFeesForMonth($pdo, $monthDate) {
    // 1. Fetch active students and resolve their current batch and fee
    $stmt = $pdo->query("
        SELECT 
            s.student_id,
            s.batch_id as student_batch_id,
            s.batch_name as student_batch_name,
            s.monthly_fee as student_custom_fee,
            b.batch_id as resolved_batch_id,
            b.monthly_fee as batch_standard_fee
        FROM vsa_students s
        LEFT JOIN vsa_batches b ON (
            (s.batch_id IS NOT NULL AND s.batch_id = b.batch_id)
            OR (LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
        )
        WHERE s.status = 'Active'
    ");
    $students = $stmt->fetchAll();

    if (empty($students)) {
        return 0;
    }

    // Default due date: 10th of the billing month
    $dueDate = date('Y-m-10', strtotime($monthDate));

    // Fallback batch ID if none matches
    $defaultBatchId = 1;
    $firstBatchStmt = $pdo->query("SELECT batch_id FROM vsa_batches LIMIT 1");
    if ($fb = $firstBatchStmt->fetch()) {
        $defaultBatchId = intval($fb['batch_id']);
    }

    $insertStmt = $pdo->prepare("
        INSERT INTO vsa_student_fees 
            (student_id, batch_id, fee_month, due_date, fee_amount, payment_status)
        VALUES 
            (?, ?, ?, ?, ?, 'Unpaid')
        ON DUPLICATE KEY UPDATE fee_id = fee_id
    ");

    $createdCount = 0;
    foreach ($students as $st) {
        $studentId = intval($st['student_id']);
        $batchId = intval($st['student_batch_id'] ?: ($st['resolved_batch_id'] ?: $defaultBatchId));

        // Fee priority: Student custom fee > Batch standard fee > Default ₹1500
        $feeAmount = 1500.00;
        if (!empty($st['student_custom_fee']) && floatval($st['student_custom_fee']) > 0) {
            $feeAmount = floatval($st['student_custom_fee']);
        } elseif (!empty($st['batch_standard_fee']) && floatval($st['batch_standard_fee']) > 0) {
            $feeAmount = floatval($st['batch_standard_fee']);
        }

        $insertStmt->execute([$studentId, $batchId, $monthDate, $dueDate, $feeAmount]);
        if ($insertStmt->rowCount() === 1) {
            $createdCount++;
        }
    }

    return $createdCount;
}

// ── Overdue Updater ──────────────────────────────────────────────────────────
function updateOverdueStatuses($pdo) {
    $today = date('Y-m-d');
    $stmt = $pdo->prepare("
        UPDATE vsa_student_fees 
        SET payment_status = 'Overdue' 
        WHERE payment_status = 'Unpaid' AND due_date < ?
    ");
    $stmt->execute([$today]);
}

/**
 * Role-Based Access Control Helper
 * Strictly enforces that only authenticated Super Admin users can access Fees & Collections.
 * Authoritative source of truth is the authenticated server-side PHP session.
 * Coach and Student requests are rejected with HTTP 403 Forbidden.
 */
function verifySuperAdminAccess($pdo, $input = []) {
    if (session_status() === PHP_SESSION_NONE) {
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                   || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)
                   || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        if (ini_get('session.use_cookies')) {
            $cp = session_get_cookie_params();
            session_set_cookie_params([
                'lifetime' => $cp['lifetime'],
                'path'     => $cp['path'] ?: '/',
                'domain'   => $cp['domain'],
                'secure'   => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
        }
        @session_start();
    }

    // 1. Authenticated Server-Side Session (Authoritative Source of Truth)
    $sessionRole      = !empty($_SESSION['user_role']) ? strtolower(trim($_SESSION['user_role'])) : '';
    $sessionEmail     = !empty($_SESSION['user_email']) ? strtolower(trim($_SESSION['user_email'])) : '';
    $sessionAdminId   = intval($_SESSION['admin_id'] ?? 0);

    $hasSession = !empty($sessionRole) && !empty($sessionEmail);

    // Unauthenticated requests are strictly rejected
    if (!$hasSession) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error'   => 'Authentication required. Please log in.'
        ]);
        exit;
    }

    // 2. Role Authorization: Explicitly reject Coach or Student
    if ($sessionRole === 'coach') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error'   => 'Access denied. Coaches do not have permission to access Fees & Collections.'
        ]);
        exit;
    }

    if ($sessionRole === 'student') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error'   => 'Access denied. Students do not have permission to access Fees & Collections.'
        ]);
        exit;
    }

    // 3. Super Admin Verification strictly against vsa_superadmin table
    if ($sessionRole === 'admin' || $sessionRole === 'superadmin' || $sessionRole === 'super admin') {
        $stmt = $pdo->prepare("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE LOWER(TRIM(REPLACE(REPLACE(admin_email, '\r', ''), '\n', ''))) = ? LIMIT 1");
        $stmt->execute([$sessionEmail]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$admin && $sessionAdminId > 0) {
            $stmt = $pdo->prepare("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE admin_id = ? LIMIT 1");
            $stmt->execute([$sessionAdminId]);
            $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if ($admin) {
            return $admin;
        }
    }

    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error'   => 'Access denied. Super Admin authentication required.'
    ]);
    exit;
}

// ── Main Request Handler ─────────────────────────────────────────────────────
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = [];
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $action = $input['action'] ?? $action;
}

// Enforce strict Super Admin access control across all operations
$currentAdmin = verifySuperAdminAccess($pdo, $input);

try {
    // ── 0.1 CHECK PAYMENT CYCLE EXISTENCE ────────────────────────────────────
    if ($action === 'check_cycle') {
        $month = trim($_GET['month'] ?? ($input['month'] ?? ''));
        $year  = trim($_GET['year'] ?? ($input['year'] ?? ''));
        if (empty($month) || empty($year)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Month and Year parameters are required.']);
            exit;
        }

        $feeMonth = parseMonthParam("$month $year");
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM vsa_student_fees WHERE fee_month = ?");
        $stmt->execute([$feeMonth]);
        $count = intval($stmt->fetchColumn() ?: 0);

        echo json_encode([
            'success'     => true,
            'exists'      => ($count > 0),
            'count'       => $count,
            'month'       => $month,
            'year'        => intval($year),
            'fee_month'   => $feeMonth,
            'month_label' => date('F Y', strtotime($feeMonth))
        ]);
        exit;
    }

    // ── 0.2 START PAYMENT CYCLE & SCHEDULE WHATSAPP NOTIFICATIONS ────────────
    if ($action === 'start_payment_cycle') {
        if ($method !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
            exit;
        }

        $month = trim($input['month'] ?? '');
        $year  = trim($input['year'] ?? '');

        if (empty($month) || empty($year)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Month and Year are required.']);
            exit;
        }

        $feeMonth = parseMonthParam("$month $year");
        $monthLabel = date('F Y', strtotime($feeMonth));

        // 1. Strict Duplicate Check (Backend is final authority)
        $dupStmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM vsa_student_fees WHERE fee_month = ?");
        $dupStmt->execute([$feeMonth]);
        if (intval($dupStmt->fetchColumn() ?: 0) > 0) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'error'   => 'PAYMENT_ALREADY_STARTED',
                'message' => "Payment for $monthLabel has already been started. You cannot start the same payment cycle again."
            ]);
            exit;
        }

        // 2. Validate Notification Schedules (At least 1 required, valid future dates/times in IST, no duplicates)
        $rawSchedules = $input['schedules'] ?? [];
        $scheduleValidation = validateNotificationSchedules($rawSchedules);
        if (!$scheduleValidation['valid']) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error'   => $scheduleValidation['error']
            ]);
            exit;
        }
        $validatedSchedules = $scheduleValidation['schedules'];

        // 3. Fetch all active students and resolve batch & fee
        $studentsStmt = $pdo->query("
            SELECT 
                s.student_id,
                s.student_name,
                s.whatsapp_number,
                s.student_phone,
                s.batch_id as student_batch_id,
                s.batch_name as student_batch_name,
                s.monthly_fee as student_custom_fee,
                b.batch_id as resolved_batch_id,
                b.monthly_fee as batch_standard_fee
            FROM vsa_students s
            LEFT JOIN vsa_batches b ON (
                (s.batch_id IS NOT NULL AND s.batch_id = b.batch_id)
                OR (LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
            )
            WHERE s.status = 'Active'
            ORDER BY s.student_id ASC
        ");
        $activeStudents = $studentsStmt->fetchAll();

        if (empty($activeStudents)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error'   => 'No active students found in database to create payment cycle.'
            ]);
            exit;
        }

        // 4. Database Transaction: Create fee records & notification schedules atomically
        $dueDate = date('Y-m-10', strtotime($feeMonth));
        $defaultBatchId = 1;
        $firstBatchStmt = $pdo->query("SELECT batch_id FROM vsa_batches LIMIT 1");
        if ($fb = $firstBatchStmt->fetch()) {
            $defaultBatchId = intval($fb['batch_id']);
        }

        $insertFeeStmt = $pdo->prepare("
            INSERT INTO vsa_student_fees 
                (student_id, batch_id, fee_month, due_date, fee_amount, payment_status)
            VALUES 
                (?, ?, ?, ?, ?, 'Unpaid')
        ");

        $insertNotifStmt = $pdo->prepare("
            INSERT INTO vsa_payment_notifications 
                (fee_month, scheduled_at, status, total_students, sent_count, failed_count)
            VALUES 
                (?, ?, 'Scheduled', ?, 0, 0)
        ");

        $recordsCreated = 0;
        try {
            $pdo->beginTransaction();

            foreach ($activeStudents as $st) {
                $studentId = intval($st['student_id']);
                $batchId = intval($st['student_batch_id'] ?: ($st['resolved_batch_id'] ?: $defaultBatchId));

                $feeAmount = 1500.00;
                if (!empty($st['student_custom_fee']) && floatval($st['student_custom_fee']) > 0) {
                    $feeAmount = floatval($st['student_custom_fee']);
                } elseif (!empty($st['batch_standard_fee']) && floatval($st['batch_standard_fee']) > 0) {
                    $feeAmount = floatval($st['batch_standard_fee']);
                }

                $insertFeeStmt->execute([$studentId, $batchId, $feeMonth, $dueDate, $feeAmount]);
                $recordsCreated++;
            }

            foreach ($validatedSchedules as $sch) {
                $insertNotifStmt->execute([$feeMonth, $sch['scheduled_at'], count($activeStudents)]);
            }

            $pdo->commit();

            recordActivity($pdo, 'FEES', 'Created', 'Payment Cycle', null, $monthLabel, "Started fee payment cycle for {$monthLabel} ({$recordsCreated} students)", [
                'fee_month'       => $feeMonth,
                'month_label'     => $monthLabel,
                'records_created' => $recordsCreated
            ], $input);
        } catch (Exception $dbEx) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Unable to create the payment cycle. Database error: ' . $dbEx->getMessage()
            ]);
            exit;
        }

        // Return clean success without calling Twilio immediately!
        echo json_encode([
            'success'                 => true,
            'month'                   => $month,
            'year'                    => intval($year),
            'fee_month'               => $feeMonth,
            'month_label'             => $monthLabel,
            'payment_records_created' => $recordsCreated,
            'schedules_count'         => count($validatedSchedules),
            'notifications_scheduled' => count($validatedSchedules),
            'schedules'               => $validatedSchedules,
            'whatsapp_dispatched'     => false,
            'message'                 => "Payment for $monthLabel created with " . count($validatedSchedules) . " scheduled notification(s). WhatsApp notifications will be sent automatically when due."
        ]);
        exit;
    }

    // ── 0.3 DELETE PAYMENT CYCLE (Super Admin Only) ──────────────────────────
    if ($action === 'delete_cycle') {
        if ($method !== 'POST' && $method !== 'DELETE') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST or DELETE.']);
            exit;
        }

        $feeMonthParam = trim($input['fee_month'] ?? $_GET['fee_month'] ?? '');
        $month = trim($input['month'] ?? $_GET['month'] ?? '');
        $year  = trim($input['year'] ?? $_GET['year'] ?? '');

        if (!empty($feeMonthParam) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $feeMonthParam)) {
            $feeMonth = $feeMonthParam;
        } elseif (!empty($month) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $month)) {
            $feeMonth = $month;
        } elseif (!empty($month) && !empty($year) && is_numeric($year)) {
            $feeMonth = parseMonthParam("$month $year");
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Valid payment cycle identification (fee_month or month and year) is required.']);
            exit;
        }

        // Validate fee_month format YYYY-MM-01
        if (!preg_match('/^\d{4}-\d{2}-01$/', $feeMonth)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid fee_month format.']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            $delNotifStmt = $pdo->prepare("DELETE FROM vsa_payment_notifications WHERE fee_month = ?");
            $delNotifStmt->execute([$feeMonth]);
            $deletedNotifCount = $delNotifStmt->rowCount();

            $deleteStmt = $pdo->prepare("DELETE FROM vsa_student_fees WHERE fee_month = ?");
            $deleteStmt->execute([$feeMonth]);
            $deletedCount = $deleteStmt->rowCount();

            $pdo->commit();

            $monthLabel = date('F Y', strtotime($feeMonth));
            recordActivity($pdo, 'FEES', 'Deleted', 'Payment Cycle', null, $monthLabel, "Deleted payment cycle and scheduled notifications for {$monthLabel}", [
                'fee_month'       => $feeMonth,
                'deleted_records' => $deletedCount
            ], $input);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error deleting cycle: ' . $e->getMessage()]);
            exit;
        }

        echo json_encode([
            'success'                     => true,
            'deleted_count'               => $deletedCount,
            'deleted_notifications_count' => $deletedNotifCount,
            'fee_month'                   => $feeMonth
        ]);
        exit;
    }

    // ── 0.4 GET CYCLE SCHEDULED NOTIFICATIONS ────────────────────────────────
    if ($action === 'get_cycle_schedules') {
        $monthParam = $_GET['month'] ?? ($input['month'] ?? '');
        $feeMonthParam = $_GET['fee_month'] ?? ($input['fee_month'] ?? '');
        if (!empty($feeMonthParam) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $feeMonthParam)) {
            $feeMonth = $feeMonthParam;
        } else {
            $feeMonth = parseMonthParam($monthParam);
        }

        $stmt = $pdo->prepare("
            SELECT 
                notification_id,
                fee_month,
                DATE_FORMAT(scheduled_at, '%Y-%m-%d %H:%i:%s') as scheduled_at,
                DATE_FORMAT(scheduled_at, '%d/%m/%Y %h:%i %p') as scheduled_at_formatted,
                status,
                total_students,
                sent_count,
                failed_count,
                error_message,
                DATE_FORMAT(sent_at, '%d/%m/%Y %h:%i %p') as sent_at_formatted
            FROM vsa_payment_notifications
            WHERE fee_month = ?
            ORDER BY scheduled_at ASC
        ");
        $stmt->execute([$feeMonth]);
        $schedules = $stmt->fetchAll();

        echo json_encode([
            'success'   => true,
            'fee_month' => $feeMonth,
            'schedules' => $schedules
        ]);
        exit;
    }

    // ── 0.5 PROCESS DUE SCHEDULED NOTIFICATIONS (Worker Endpoint) ────────────
    if ($action === 'process_scheduled_notifications') {
        $result = processDuePaymentNotifications($pdo);
        echo json_encode($result);
        exit;
    }


    // 1. GET FEES LIST (Default Action)
    if ($action === 'get_fees' || empty($action)) {
        $monthParam = $_GET['month'] ?? '';
        $batchParam = $_GET['batch_id'] ?? 'all';
        $statusParam = strtolower(trim($_GET['status'] ?? 'all'));
        $searchParam = trim($_GET['search'] ?? '');
        $sortParam = trim($_GET['sort'] ?? 'name');

        // Fetch running fee months from database (sorted newest first)
        $monthsStmt = $pdo->query("SELECT DISTINCT fee_month FROM vsa_student_fees ORDER BY fee_month DESC");
        $availableMonths = $monthsStmt->fetchAll(PDO::FETCH_COLUMN);

        // Determine active fee month
        $feeMonth = '';
        if (!empty($monthParam)) {
            $parsed = parseMonthParam($monthParam);
            if (in_array($parsed, $availableMonths)) {
                $feeMonth = $parsed;
            }
        }
        if (empty($feeMonth) && !empty($availableMonths)) {
            $feeMonth = $availableMonths[0];
        }

        // Fetch batches for filter dropdown
        $batchesStmt = $pdo->query("SELECT batch_id, batch_name FROM vsa_batches ORDER BY batch_id ASC");
        $batches = $batchesStmt->fetchAll();

        if (empty($availableMonths) || empty($feeMonth)) {
            // Graceful empty state when no payment cycles exist in database
            echo json_encode([
                'success' => true,
                'summary' => [
                    'total'             => 0,
                    'paid'              => 0,
                    'unpaid'            => 0,
                    'paid_percentage'   => 0,
                    'unpaid_percentage' => 0,
                    'selected_month'    => '',
                    'fee_month_date'    => ''
                ],
                'students'         => [],
                'batches'          => $batches,
                'available_months' => []
            ]);
            exit;
        }

        // Update overdue status
        updateOverdueStatuses($pdo);

        // Build base summary metrics query for this month and batch filter
        $summarySql = "
            SELECT 
                COUNT(*) as total_students,
                SUM(CASE WHEN f.payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_students,
                SUM(CASE WHEN f.payment_status != 'Paid' THEN 1 ELSE 0 END) as unpaid_students
            FROM vsa_student_fees f
            INNER JOIN vsa_students s ON f.student_id = s.student_id
            WHERE f.fee_month = ? AND s.status = 'Active'
        ";
        $summaryParams = [$feeMonth];

        if ($batchParam !== 'all' && $batchParam !== '') {
            if (is_numeric($batchParam)) {
                $summarySql .= " AND f.batch_id = ?";
                $summaryParams[] = intval($batchParam);
            } else {
                $summarySql .= " AND f.batch_id IN (SELECT batch_id FROM vsa_batches WHERE batch_name = ?)";
                $summaryParams[] = $batchParam;
            }
        }

        $sumStmt = $pdo->prepare($summarySql);
        $sumStmt->execute($summaryParams);
        $sumResult = $sumStmt->fetch();

        $totalStudents = intval($sumResult['total_students'] ?? 0);
        $paidStudents = intval($sumResult['paid_students'] ?? 0);
        $unpaidStudents = intval($sumResult['unpaid_students'] ?? 0);
        $paidPercentage = $totalStudents > 0 ? round(($paidStudents / $totalStudents) * 100) : 0;
        $unpaidPercentage = $totalStudents > 0 ? (100 - $paidPercentage) : 0;

        // Build student cards list query
        $listSql = "
            SELECT 
                f.fee_id,
                f.student_id,
                s.student_name,
                s.student_phone,
                s.student_photo,
                s.city,
                f.batch_id,
                COALESCE(b.batch_name, s.batch_name, 'Batch') AS batch_name,
                DATE_FORMAT(f.fee_month, '%Y-%m-%d') as fee_month,
                DATE_FORMAT(f.due_date, '%d/%m/%Y') as due_date,
                f.fee_amount,
                f.payment_status,
                f.paid_amount,
                DATE_FORMAT(f.paid_at, '%d/%m/%Y %H:%i') as paid_at,
                f.payment_method,
                f.razorpay_order_id,
                f.razorpay_payment_id
            FROM vsa_student_fees f
            INNER JOIN vsa_students s ON f.student_id = s.student_id
            LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
            WHERE f.fee_month = ? AND s.status = 'Active'
        ";
        $listParams = [$feeMonth];

        // Filter by Batch
        if ($batchParam !== 'all' && $batchParam !== '') {
            if (is_numeric($batchParam)) {
                $listSql .= " AND f.batch_id = ?";
                $listParams[] = intval($batchParam);
            } else {
                $listSql .= " AND (b.batch_name = ? OR s.batch_name = ?)";
                $listParams[] = $batchParam;
                $listParams[] = $batchParam;
            }
        }

        // Filter by Payment Status
        if ($statusParam === 'paid') {
            $listSql .= " AND f.payment_status = 'Paid'";
        } elseif ($statusParam === 'unpaid') {
            $listSql .= " AND f.payment_status != 'Paid'";
        } elseif ($statusParam === 'overdue') {
            $listSql .= " AND f.payment_status = 'Overdue'";
        }

        // Search by student name or batch
        if (!empty($searchParam)) {
            $listSql .= " AND (s.student_name LIKE ? OR s.city LIKE ? OR b.batch_name LIKE ?)";
            $searchWildcard = '%' . $searchParam . '%';
            $listParams[] = $searchWildcard;
            $listParams[] = $searchWildcard;
            $listParams[] = $searchWildcard;
        }

        // Sort by field
        if ($sortParam === 'dueDate') {
            $listSql .= " ORDER BY f.due_date ASC, s.student_name ASC";
        } elseif ($sortParam === 'feeAmount') {
            $listSql .= " ORDER BY f.fee_amount DESC, s.student_name ASC";
        } elseif ($sortParam === 'status') {
            $listSql .= " ORDER BY f.payment_status ASC, s.student_name ASC";
        } else {
            // Default: Name A -> Z
            $listSql .= " ORDER BY s.student_name ASC";
        }

        $listStmt = $pdo->prepare($listSql);
        $listStmt->execute($listParams);
        $students = $listStmt->fetchAll();

        // Fetch scheduled notifications count for this payment cycle
        $schedCountStmt = $pdo->prepare("SELECT COUNT(*) FROM vsa_payment_notifications WHERE fee_month = ?");
        $schedCountStmt->execute([$feeMonth]);
        $scheduledCount = intval($schedCountStmt->fetchColumn() ?: 0);

        echo json_encode([
            'success' => true,
            'summary' => [
                'total'                   => $totalStudents,
                'paid'                    => $paidStudents,
                'unpaid'                  => $unpaidStudents,
                'paid_percentage'         => $paidPercentage,
                'unpaid_percentage'       => $unpaidPercentage,
                'selected_month'          => date('F Y', strtotime($feeMonth)),
                'fee_month_date'          => $feeMonth,
                'scheduled_notifications' => $scheduledCount
            ],
            'students'         => $students,
            'batches'          => $batches,
            'available_months' => array_map(function($m) {
                return [
                    'date'  => $m,
                    'label' => date('F Y', strtotime($m))
                ];
            }, $availableMonths)
        ]);
        exit;
    }

    // 2. GET SINGLE STUDENT FEE DETAILS (For Modal)
    if ($action === 'get_student_fee_details') {
        $feeId = intval($_GET['fee_id'] ?? 0);
        $studentId = intval($_GET['student_id'] ?? 0);
        $monthParam = $_GET['month'] ?? '';

        if ($feeId > 0) {
            $stmt = $pdo->prepare("
                SELECT 
                    f.*,
                    s.student_name,
                    s.student_phone,
                    s.student_photo,
                    s.city,
                    COALESCE(b.batch_name, s.batch_name, 'Batch') AS batch_name,
                    DATE_FORMAT(f.fee_month, '%M %Y') as month_label,
                    DATE_FORMAT(f.due_date, '%d/%m/%Y') as due_date_formatted,
                    DATE_FORMAT(f.paid_at, '%d/%m/%Y %H:%i') as paid_at_formatted
                FROM vsa_student_fees f
                INNER JOIN vsa_students s ON f.student_id = s.student_id
                LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
                WHERE f.fee_id = ?
            ");
            $stmt->execute([$feeId]);
        } else {
            $feeMonth = parseMonthParam($monthParam);
            $stmt = $pdo->prepare("
                SELECT 
                    f.*,
                    s.student_name,
                    s.student_phone,
                    s.student_photo,
                    s.city,
                    COALESCE(b.batch_name, s.batch_name, 'Batch') AS batch_name,
                    DATE_FORMAT(f.fee_month, '%M %Y') as month_label,
                    DATE_FORMAT(f.due_date, '%d/%m/%Y') as due_date_formatted,
                    DATE_FORMAT(f.paid_at, '%d/%m/%Y %H:%i') as paid_at_formatted
                FROM vsa_student_fees f
                INNER JOIN vsa_students s ON f.student_id = s.student_id
                LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
                WHERE f.student_id = ? AND f.fee_month = ?
            ");
            $stmt->execute([$studentId, $feeMonth]);
        }

        $record = $stmt->fetch();
        if (!$record) {
            http_response_code(404);
            echo json_encode(['error' => 'Fee record not found.']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'fee'     => $record
        ]);
        exit;
    }

    // 3. RECORD / VERIFY PAYMENT
    if ($action === 'record_payment') {
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

        $feeId = intval($input['fee_id'] ?? 0);
        $paidAmount = floatval($input['paid_amount'] ?? 0);
        $paymentMethod = trim($input['payment_method'] ?? 'Razorpay (UPI)');
        $paymentId = trim($input['razorpay_payment_id'] ?? ('pay_' . uniqid()));
        $orderId = trim($input['razorpay_order_id'] ?? ('order_' . uniqid()));

        if ($feeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Valid fee_id is required.']);
            exit;
        }

        $checkStmt = $pdo->prepare("SELECT fee_id, fee_amount, payment_status FROM vsa_student_fees WHERE fee_id = ?");
        $checkStmt->execute([$feeId]);
        $existing = $checkStmt->fetch();

        if (!$existing) {
            http_response_code(404);
            echo json_encode(['error' => 'Fee record not found.']);
            exit;
        }

        if ($paidAmount <= 0) {
            $paidAmount = floatval($existing['fee_amount']);
        }

        $updateStmt = $pdo->prepare("
            UPDATE vsa_student_fees
            SET 
                payment_status = 'Paid',
                paid_amount = ?,
                payment_method = ?,
                razorpay_payment_id = ?,
                razorpay_order_id = ?,
                paid_at = NOW()
            WHERE fee_id = ?
        ");
        $updateStmt->execute([$paidAmount, $paymentMethod, $paymentId, $orderId, $feeId]);

        $infoStmt = $pdo->prepare("SELECT f.fee_month, s.student_name FROM vsa_student_fees f JOIN vsa_students s ON f.student_id = s.student_id WHERE f.fee_id = ?");
        $infoStmt->execute([$feeId]);
        $feeInfo = $infoStmt->fetch();
        $sName = $feeInfo ? $feeInfo['student_name'] : "Student";
        $fMonth = $feeInfo ? date('M Y', strtotime($feeInfo['fee_month'])) : '';

        recordActivity($pdo, 'FEES', 'Recorded', 'Payment', $feeId, $sName, "Recorded payment of ₹{$paidAmount} ({$paymentMethod}) for {$sName} ({$fMonth})", [
            'fee_id'         => $feeId,
            'student_name'   => $sName,
            'paid_amount'    => $paidAmount,
            'payment_method' => $paymentMethod,
            'payment_id'     => $paymentId
        ], $input);

        echo json_encode([
            'success' => true,
            'message' => 'Payment recorded successfully.',
            'payment' => [
                'fee_id'              => $feeId,
                'payment_status'      => 'Paid',
                'paid_amount'         => $paidAmount,
                'payment_method'      => $paymentMethod,
                'razorpay_payment_id' => $paymentId,
                'paid_at'             => date('Y-m-d H:i:s')
            ]
        ]);
        exit;
    }

    // 4. TRIGGER MONTHLY GENERATION
    if ($action === 'generate_monthly') {
        $monthParam = $_GET['month'] ?? $_POST['month'] ?? '';
        $feeMonth = parseMonthParam($monthParam);
        $count = generateMonthlyFeesForMonth($pdo, $feeMonth);

        $monthLabel = date('F Y', strtotime($feeMonth));
        recordActivity($pdo, 'FEES', 'Created', 'Fee', null, $monthLabel, "Generated monthly fees for {$monthLabel} ({$count} students processed)", [
            'fee_month' => $feeMonth,
            'count'     => $count
        ], array_merge($_GET, $_POST));

        echo json_encode([
            'success'   => true,
            'month'     => $feeMonth,
            'generated' => $count
        ]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Invalid action requested.']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>
