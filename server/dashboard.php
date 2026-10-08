<?php
/**
 * VAVA Sports Academy - Central Dashboard API Endpoint
 * 
 * Provides structured operational KPIs, attendance analytics, batch overviews,
 * financial summaries (Super Admin strictly), and recent activity logs.
 * 
 * Role-Based Access Control:
 * - Super Admin: Full academy-wide operational and financial analytics.
 * - Coach: Strictly scoped to assigned batches and students; zero financial data.
 * - Student: Forbidden (HTTP 403).
 */

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

// 1. Explicitly approved development & production origins
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

// 2. Evaluated whitelist check:
// - Exact match in $allowedOrigins
// - Local development host (localhost or 127.0.0.1 on any port)
// - Production VAVA Sports domain or subdomain (*.vavasports.com)
// - Hostinger preview/production domains (*.hostingersite.com, *.hostingerapp.com)
// - Verified same-host origin (origin host matches current web server HTTP_HOST)
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
        // Matches current host or apex/www pair of current host
        if ($originHost === $serverHostOnly ||
            $originHost === 'www.' . $serverHostOnly ||
            'www.' . $originHost === $serverHostOnly) {
            $isAllowedOrigin = true;
        }
    }
}

// 3. Emit CORS Headers
header('Vary: Origin');

if ($isAllowedOrigin) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID, X-VAVA-Coach-Id, X-VAVA-Student-ID, X-VAVA-Student-Id, X-VAVA-Actor-Name, X-Requested-With, Accept, Origin');

// 4. Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if ($isAllowedOrigin) {
        header('Access-Control-Max-Age: 86400');
        http_response_code(200);
    } else {
        http_response_code(403);
    }
    exit;
}

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once 'db_connect.php';

// Helper: Ensure overdue statuses are updated according to current date
function updateOverdueStatuses($pdo) {
    try {
        $today = date('Y-m-d');
        $stmt = $pdo->prepare("
            UPDATE vsa_student_fees 
            SET payment_status = 'Overdue' 
            WHERE payment_status = 'Unpaid' AND due_date < ?
        ");
        $stmt->execute([$today]);
    } catch (Exception $e) {
        // Non-blocking for dashboard read
    }
}

// ── Role & Authentication Resolution ─────────────────────────────────────────
function resolveDashboardUser($pdo) {
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
    $sessionCoachId   = intval($_SESSION['coach_id'] ?? 0);
    $sessionStudentId = intval($_SESSION['student_id'] ?? 0);
    $sessionAdminId   = intval($_SESSION['admin_id'] ?? 0);

    $hasSession = !empty($sessionRole) && !empty($sessionEmail);

    // Unauthenticated requests are strictly rejected (No anonymous or development fallbacks)
    if (!$hasSession) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error'   => 'Authentication required. Please log in.'
        ]);
        exit;
    }

    $effectiveRole  = $sessionRole;
    $effectiveEmail = $sessionEmail;

    // ── ROLE: STUDENT ────────────────────────────────────────────────────────
    if ($effectiveRole === 'student') {
        $student = null;
        if (!empty($effectiveEmail)) {
            $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE LOWER(TRIM(student_email)) = ? LIMIT 1');
            $stmt->execute([$effectiveEmail]);
            $student = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        if (!$student && $sessionStudentId > 0) {
            $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE student_id = ? LIMIT 1');
            $stmt->execute([$sessionStudentId]);
            $student = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$student) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error'   => 'Student authorization failed. Verified student profile record not found.'
            ]);
            exit;
        }

        // Authoritative Student ID derived strictly from database record
        $trustedStudentId = intval($student['student_id']);

        return [
            'role'       => 'student',
            'student_id' => $trustedStudentId,
            'name'       => $student['student_name'] ?: 'Student',
            'email'      => $student['student_email'],
            'batch_id'   => intval($student['batch_id'] ?? 0),
            'coach_id'   => intval($student['coach_id'] ?? 0),
            'photo'      => $student['student_photo'] ?? '',
            'raw'        => $student
        ];
    }

    // ── ROLE: COACH ──────────────────────────────────────────────────────────
    if ($effectiveRole === 'coach') {
        $coach = null;
        if (!empty($effectiveEmail)) {
            $stmt = $pdo->prepare('SELECT coach_id, coach_name, coach_email, batch_id, coach_photo FROM vsa_coaches WHERE LOWER(TRIM(coach_email)) = ? LIMIT 1');
            $stmt->execute([$effectiveEmail]);
            $coach = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        if (!$coach && $sessionCoachId > 0) {
            $stmt = $pdo->prepare('SELECT coach_id, coach_name, coach_email, batch_id, coach_photo FROM vsa_coaches WHERE coach_id = ? LIMIT 1');
            $stmt->execute([$sessionCoachId]);
            $coach = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$coach) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error'   => 'Coach authorization failed. Coach profile record not found.'
            ]);
            exit;
        }

        // Authoritative Coach ID derived strictly from database record
        $trustedCoachId = intval($coach['coach_id']);

        return [
            'role'       => 'coach',
            'coach_id'   => $trustedCoachId,
            'name'       => $coach['coach_name'] ?: 'Coach',
            'email'      => $coach['coach_email'],
            'batch_id'   => intval($coach['batch_id'] ?? 0),
            'photo'      => $coach['coach_photo'] ?? ''
        ];
    }

    // ── ROLE: SUPER ADMIN / ADMIN ────────────────────────────────────────────
    if ($effectiveRole === 'admin' || $effectiveRole === 'superadmin' || $effectiveRole === 'super admin') {
        $admin = null;
        $stmt = $pdo->prepare("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE LOWER(TRIM(REPLACE(REPLACE(admin_email, '\r', ''), '\n', ''))) = ? LIMIT 1");
        $stmt->execute([$effectiveEmail]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$admin && $sessionAdminId > 0) {
            $stmt = $pdo->prepare("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE admin_id = ? LIMIT 1");
            $stmt->execute([$sessionAdminId]);
            $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if ($admin) {
            return [
                'role'     => 'superadmin',
                'admin_id' => intval($admin['admin_id']),
                'name'     => $admin['admin_name'] ?: 'Super Admin',
                'email'    => $admin['admin_email']
            ];
        }
    }

    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error'   => 'Access denied. Valid administrative authentication required.'
    ]);
    exit;
}

$currentUser = resolveDashboardUser($pdo);
$isSuperAdmin = ($currentUser['role'] === 'superadmin');

try {
    $today = date('Y-m-d');
    updateOverdueStatuses($pdo);

    // =========================================================================
    // CASE A: SUPER ADMIN DASHBOARD (Academy-Wide)
    // =========================================================================
    if ($isSuperAdmin) {
        // 1. KPI Counts
        // Students
        $studentStmt = $pdo->query("
            SELECT 
                COUNT(*) AS total_students,
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) AS active_students,
                COALESCE(SUM(CASE WHEN status != 'Active' THEN 1 ELSE 0 END), 0) AS inactive_students
            FROM vsa_students
        ");
        $studentKpi = $studentStmt->fetch(PDO::FETCH_ASSOC);

        // Coaches
        $coachStmt = $pdo->query("
            SELECT 
                COUNT(*) AS total_coaches,
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) AS active_coaches
            FROM vsa_coaches
        ");
        $coachKpi = $coachStmt->fetch(PDO::FETCH_ASSOC);

        // Batches
        $batchStmt = $pdo->query("
            SELECT 
                COUNT(*) AS total_batches,
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) AS active_batches
            FROM vsa_batches
        ");
        $batchKpi = $batchStmt->fetch(PDO::FETCH_ASSOC);

        // Today's Attendance
        $todayAttStmt = $pdo->prepare("
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present_today,
                COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_today,
                COUNT(attendance_id) AS total_today,
                COUNT(DISTINCT batch_id) AS batches_marked_today
            FROM vsa_attendance
            WHERE attendance_date = ?
        ");
        $todayAttStmt->execute([$today]);
        $todayAtt = $todayAttStmt->fetch(PDO::FETCH_ASSOC);

        $presentToday = intval($todayAtt['present_today'] ?? 0);
        $absentToday  = intval($todayAtt['absent_today'] ?? 0);
        $totalToday   = intval($todayAtt['total_today'] ?? 0);
        $batchesToday = intval($todayAtt['batches_marked_today'] ?? 0);
        $attendanceRateToday = $totalToday > 0 ? round(($presentToday / $totalToday) * 100, 1) : null;
        $hasSessionsToday = ($totalToday > 0);

        // 2. Latest 7 Active Attendance Dates Trend
        $trendStmt = $pdo->query("
            SELECT 
                attendance_date,
                COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present_cnt,
                COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_cnt,
                COUNT(*) AS total_cnt
            FROM vsa_attendance
            WHERE attendance_date IN (
                SELECT attendance_date FROM (
                    SELECT DISTINCT attendance_date
                    FROM vsa_attendance
                    ORDER BY attendance_date DESC
                    LIMIT 7
                ) AS recent_dates
            )
            GROUP BY attendance_date
            ORDER BY attendance_date ASC
        ");
        $sevenDayTrend = [];
        while ($row = $trendStmt->fetch(PDO::FETCH_ASSOC)) {
            $dt = $row['attendance_date'];
            $p  = intval($row['present_cnt']);
            $a  = intval($row['absent_cnt']);
            $t  = intval($row['total_cnt']);
            $sevenDayTrend[] = [
                'date'           => $dt,
                'date_label'     => date('M j', strtotime($dt)),
                'date_formatted' => date('M j', strtotime($dt)),
                'day_name'       => date('D', strtotime($dt)),
                'present'        => $p,
                'absent'         => $a,
                'total'          => $t,
                'rate'           => $t > 0 ? round(($p / $t) * 100, 1) : null
            ];
        }

        // 3. Financial Overview (Super Admin Only)
        // Collected This Month
        $monthStart = date('Y-m-01 00:00:00');
        $monthEnd   = date('Y-m-t 23:59:59');

        $collectedStmt = $pdo->prepare("
            SELECT COALESCE(SUM(paid_amount), 0.00) AS collected
            FROM vsa_student_fees
            WHERE payment_status = 'Paid'
              AND paid_at >= ? AND paid_at <= ?
        ");
        $collectedStmt->execute([$monthStart, $monthEnd]);
        $collectedThisMonth = floatval($collectedStmt->fetchColumn() ?: 0.00);

        // Outstanding & Overdue Balances (Excluding Refunded)
        $balancesStmt = $pdo->query("
            SELECT 
                COALESCE(SUM(CASE WHEN f.payment_status IN ('Unpaid', 'Overdue') THEN GREATEST(0, f.fee_amount - COALESCE(f.paid_amount, 0)) ELSE 0 END), 0.00) AS total_outstanding,
                COALESCE(SUM(CASE WHEN f.payment_status = 'Overdue' THEN GREATEST(0, f.fee_amount - COALESCE(f.paid_amount, 0)) ELSE 0 END), 0.00) AS total_overdue,
                COALESCE(SUM(CASE WHEN f.payment_status IN ('Unpaid', 'Overdue') THEN 1 ELSE 0 END), 0) AS unpaid_invoices_count
            FROM vsa_student_fees f
            INNER JOIN vsa_students s ON f.student_id = s.student_id
            WHERE s.status = 'Active'
        ");
        $balances = $balancesStmt->fetch(PDO::FETCH_ASSOC);
        $totalOutstanding = floatval($balances['total_outstanding'] ?? 0.00);
        $totalOverdue     = floatval($balances['total_overdue'] ?? 0.00);
        $unpaidInvoices   = intval($balances['unpaid_invoices_count'] ?? 0);

        // 6-Month Fee Collection Trend (Pre-initialized for all 6 past months)
        $sixMonths = [];
        for ($i = 5; $i >= 0; $i--) {
            $mKey = date('Y-m', strtotime("-$i months"));
            $sixMonths[$mKey] = [
                'month'       => $mKey,
                'month_label' => date('M Y', strtotime("-$i months")),
                'label'       => date('M Y', strtotime("-$i months")),
                'billed'      => 0.00,
                'collected'   => 0.00
            ];
        }

        $feeTrendStmt = $pdo->query("
            SELECT 
                DATE_FORMAT(fee_month, '%Y-%m') AS billing_month,
                DATE_FORMAT(fee_month, '%b %Y') AS month_label,
                COALESCE(SUM(fee_amount), 0.00) AS billed,
                COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN paid_amount ELSE 0 END), 0.00) AS collected
            FROM vsa_student_fees
            WHERE fee_month >= DATE_SUB(DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
            GROUP BY DATE_FORMAT(fee_month, '%Y-%m'), DATE_FORMAT(fee_month, '%b %Y')
            ORDER BY billing_month ASC
        ");
        while ($row = $feeTrendStmt->fetch(PDO::FETCH_ASSOC)) {
            $mKey = $row['billing_month'];
            if (isset($sixMonths[$mKey])) {
                $sixMonths[$mKey]['billed']    = floatval($row['billed']);
                $sixMonths[$mKey]['collected'] = floatval($row['collected']);
            }
        }
        $sixMonthTrend = array_values($sixMonths);

        // 4. Batch Overview
        $batchListStmt = $pdo->query("
            SELECT 
                b.batch_id,
                b.coach_id,
                b.batch_name,
                b.batch_time,
                b.batch_location,
                COALESCE(b.sport, 'Football') AS sport,
                b.max_students AS capacity,
                COALESCE(c.coach_name, 'Unassigned') AS coach_name,
                COUNT(DISTINCT s.student_id) AS student_count
            FROM vsa_batches b
            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            LEFT JOIN vsa_students s ON s.batch_id = b.batch_id AND s.status = 'Active'
            WHERE b.status = 'Active'
            GROUP BY b.batch_id, b.coach_id, b.batch_name, b.batch_time, b.batch_location, b.sport, b.max_students, c.coach_name
            ORDER BY student_count DESC, b.batch_name ASC
            LIMIT 10
        ");
        $batches = [];
        while ($b = $batchListStmt->fetch(PDO::FETCH_ASSOC)) {
            $cap = intval($b['capacity'] ?? 0);
            $cnt = intval($b['student_count'] ?? 0);
            $util = $cap > 0 ? round(($cnt / $cap) * 100, 1) : 0;
            $batches[] = [
                'batch_id'         => intval($b['batch_id']),
                'coach_id'         => intval($b['coach_id'] ?? 0),
                'batch_name'       => $b['batch_name'],
                'batch_time'       => $b['batch_time'] ?: 'Flexible Schedule',
                'batch_location'   => $b['batch_location'] ?: 'Academy Grounds',
                'sport'            => $b['sport'],
                'coach_name'       => $b['coach_name'],
                'student_count'    => $cnt,
                'capacity'         => $cap,
                'max_capacity'     => $cap,
                'utilization_rate' => $util
            ];
        }

        // 5. Recent Activity Log (Latest 8 records)
        $actStmt = $pdo->query("
            SELECT 
                activity_id,
                COALESCE(actor_name, 'System') AS actor_name,
                actor_role,
                module,
                action_type,
                COALESCE(description, action_type) AS action,
                target_type,
                target_name,
                description,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
                DATE_FORMAT(created_at, '%b %e, %Y at %l:%i %p') AS formatted_time
            FROM vsa_activity_log
            ORDER BY created_at DESC, activity_id DESC
            LIMIT 8
        ");
        $recentActivity = $actStmt->fetchAll(PDO::FETCH_ASSOC);

        // Build Super Admin Response with both top-level and nested data keys
        $responseData = [
            'role'            => 'superadmin',
            'user'            => [
                'name'  => $currentUser['name'],
                'email' => $currentUser['email']
            ],
            'user_name'       => $currentUser['name'],
            'generated_at'    => date('Y-m-d H:i:s'),
            'current_date'    => date('l, F j, Y'),
            'kpis'            => [
                'students' => [
                    'total'    => intval($studentKpi['total_students'] ?? 0),
                    'active'   => intval($studentKpi['active_students'] ?? 0),
                    'inactive' => intval($studentKpi['inactive_students'] ?? 0)
                ],
                'coaches' => [
                    'total'    => intval($coachKpi['total_coaches'] ?? 0),
                    'active'   => intval($coachKpi['active_coaches'] ?? 0)
                ],
                'batches' => [
                    'total'    => intval($batchKpi['total_batches'] ?? 0),
                    'active'   => intval($batchKpi['active_batches'] ?? 0)
                ],
                'attendance_today' => [
                    'present'         => $presentToday,
                    'absent'          => $absentToday,
                    'total'           => $totalToday,
                    'batches_marked'  => $batchesToday,
                    'attendance_rate' => $attendanceRateToday,
                    'has_sessions'    => $hasSessionsToday
                ]
            ],
            'attendance'      => [
                'present_today'        => $presentToday,
                'absent_today'         => $absentToday,
                'batches_marked'       => $batchesToday,
                'batches_marked_today' => $batchesToday,
                'attendance_rate'      => $attendanceRateToday,
                'session_status'       => $hasSessionsToday ? 'recorded' : 'none',
                'has_sessions_today'   => $hasSessionsToday,
                'seven_day_trend'      => $sevenDayTrend
            ],
            'financial'       => [
                'collected_this_month'  => $collectedThisMonth,
                'total_outstanding'     => $totalOutstanding,
                'total_overdue'         => $totalOverdue,
                'unpaid_invoices_count' => $unpaidInvoices,
                'six_month_trend'       => $sixMonthTrend
            ],
            'batches'         => [
                'total' => count($batches),
                'list'  => $batches
            ],
            'recent_activity' => [
                'total' => count($recentActivity),
                'list'  => $recentActivity
            ]
        ];

        echo json_encode(array_merge([
            'success' => true,
            'data'    => $responseData
        ], $responseData));
        exit;
    }

    // =========================================================================
    // CASE B: COACH DASHBOARD (Scoped to Assigned Batches & Students Only)
    // =========================================================================
    if ($currentUser['role'] === 'coach') {
        $coachId = $currentUser['coach_id'];

        // 1. Resolve Assigned Batches
        $assignedStmt = $pdo->prepare("
            SELECT 
                b.batch_id,
                b.batch_name,
                b.batch_time,
                b.batch_location,
                COALESCE(b.sport, 'Football') AS sport,
                b.max_students AS capacity
            FROM vsa_batches b
            WHERE (b.coach_id = ? OR b.batch_id = ?) AND b.status = 'Active'
            ORDER BY b.batch_name ASC
        ");
        $assignedStmt->execute([$coachId, $currentUser['batch_id']]);
        $coachBatchesRaw = $assignedStmt->fetchAll(PDO::FETCH_ASSOC);

        $assignedBatchIds = array_column($coachBatchesRaw, 'batch_id');

        if (empty($assignedBatchIds)) {
            // Coach has no assigned batches
            $emptyCoachData = [
                'role'         => 'coach',
                'user'         => [
                    'coach_id' => $coachId,
                    'name'     => $currentUser['name'],
                    'email'    => $currentUser['email'],
                    'photo'    => $currentUser['photo'] ?? ''
                ],
                'user_name'    => $currentUser['name'],
                'generated_at' => date('Y-m-d H:i:s'),
                'current_date' => date('l, F j, Y'),
                'kpis'         => [
                    'students' => ['total' => 0, 'active' => 0],
                    'batches'  => ['total' => 0, 'active' => 0],
                    'attendance_today' => [
                        'present'         => 0,
                        'absent'          => 0,
                        'total'           => 0,
                        'batches_marked'  => 0,
                        'attendance_rate' => null,
                        'has_sessions'    => false
                    ]
                ],
                'attendance'   => [
                    'present_today'        => 0,
                    'absent_today'         => 0,
                    'batches_marked_today' => 0,
                    'attendance_rate'      => null,
                    'has_sessions_today'   => false,
                    'seven_day_trend'      => []
                ],
                'batches'      => [
                    'total' => 0,
                    'list'  => []
                ],
                'students'     => [
                    'total' => 0,
                    'list'  => []
                ]
            ];
            echo json_encode(array_merge([
                'success' => true,
                'data'    => $emptyCoachData
            ], $emptyCoachData));
            exit;
        }

        $inPlaceholders = implode(',', array_fill(0, count($assignedBatchIds), '?'));

        // 2. Scoped Students KPI
        $coachStudentsStmt = $pdo->prepare("
            SELECT 
                COUNT(*) AS total_students,
                COALESCE(SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END), 0) AS active_students
            FROM vsa_students
            WHERE batch_id IN ($inPlaceholders)
        ");
        $coachStudentsStmt->execute($assignedBatchIds);
        $cStudents = $coachStudentsStmt->fetch(PDO::FETCH_ASSOC);

        // 3. Scoped Today Attendance
        $cTodayAttStmt = $pdo->prepare("
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present_today,
                COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_today,
                COUNT(attendance_id) AS total_today,
                COUNT(DISTINCT batch_id) AS batches_marked_today
            FROM vsa_attendance
            WHERE attendance_date = ? AND batch_id IN ($inPlaceholders)
        ");
        $cTodayAttStmt->execute(array_merge([$today], $assignedBatchIds));
        $cTodayAtt = $cTodayAttStmt->fetch(PDO::FETCH_ASSOC);

        $cPresentToday = intval($cTodayAtt['present_today'] ?? 0);
        $cAbsentToday  = intval($cTodayAtt['absent_today'] ?? 0);
        $cTotalToday   = intval($cTodayAtt['total_today'] ?? 0);
        $cBatchesToday = intval($cTodayAtt['batches_marked_today'] ?? 0);
        $cAttRateToday = $cTotalToday > 0 ? round(($cPresentToday / $cTotalToday) * 100, 1) : null;
        $cHasSessions  = ($cTotalToday > 0);

        // 4. Coach Scoped Latest 7 Active Attendance Dates Trend
        $cSevenDayTrend = [];
        $cTrendStmt = $pdo->prepare("
            SELECT 
                attendance_date,
                COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present_cnt,
                COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_cnt,
                COUNT(*) AS total_cnt
            FROM vsa_attendance
            WHERE attendance_date IN (
                SELECT attendance_date FROM (
                    SELECT DISTINCT attendance_date
                    FROM vsa_attendance
                    WHERE batch_id IN ($inPlaceholders)
                    ORDER BY attendance_date DESC
                    LIMIT 7
                ) AS recent_dates
            )
            AND batch_id IN ($inPlaceholders)
            GROUP BY attendance_date
            ORDER BY attendance_date ASC
        ");
        $cTrendStmt->execute(array_merge($assignedBatchIds, $assignedBatchIds));
        while ($row = $cTrendStmt->fetch(PDO::FETCH_ASSOC)) {
            $dt = $row['attendance_date'];
            $p  = intval($row['present_cnt']);
            $a  = intval($row['absent_cnt']);
            $t  = intval($row['total_cnt']);
            $cSevenDayTrend[] = [
                'date'           => $dt,
                'date_label'     => date('M j', strtotime($dt)),
                'date_formatted' => date('M j', strtotime($dt)),
                'day_name'       => date('D', strtotime($dt)),
                'present'        => $p,
                'absent'         => $a,
                'total'          => $t,
                'rate'           => $t > 0 ? round(($p / $t) * 100, 1) : null
            ];
        }

        // 5. Scoped Batches with Student Count & Utilization
        $cBatchListStmt = $pdo->prepare("
            SELECT 
                b.batch_id,
                b.coach_id,
                b.batch_name,
                b.batch_time,
                b.batch_location,
                COALESCE(b.sport, 'Football') AS sport,
                b.max_students AS capacity,
                COUNT(DISTINCT s.student_id) AS student_count
            FROM vsa_batches b
            LEFT JOIN vsa_students s ON s.batch_id = b.batch_id AND s.status = 'Active'
            WHERE b.batch_id IN ($inPlaceholders) AND b.status = 'Active'
            GROUP BY b.batch_id, b.coach_id, b.batch_name, b.batch_time, b.batch_location, b.sport, b.max_students
            ORDER BY student_count DESC, b.batch_name ASC
        ");
        $cBatchListStmt->execute($assignedBatchIds);
        $coachBatches = [];
        while ($b = $cBatchListStmt->fetch(PDO::FETCH_ASSOC)) {
            $cap = intval($b['capacity'] ?? 0);
            $cnt = intval($b['student_count'] ?? 0);
            $util = $cap > 0 ? round(($cnt / $cap) * 100, 1) : 0;
            $coachBatches[] = [
                'batch_id'         => intval($b['batch_id']),
                'coach_id'         => intval($b['coach_id'] ?? $coachId),
                'batch_name'       => $b['batch_name'],
                'batch_time'       => $b['batch_time'] ?: 'Flexible Schedule',
                'batch_location'   => $b['batch_location'] ?: 'Academy Grounds',
                'sport'            => $b['sport'],
                'coach_name'       => $currentUser['name'],
                'student_count'    => $cnt,
                'capacity'         => $cap,
                'max_capacity'     => $cap,
                'utilization_rate' => $util
            ];
        }

        // 6. Coach Scoped Students List (My Students Card)
        $cStudentsListStmt = $pdo->prepare("
            SELECT 
                s.student_id,
                s.student_name,
                s.student_photo,
                s.student_phone,
                s.status,
                s.batch_id,
                b.batch_name,
                (
                    SELECT a.status 
                    FROM vsa_attendance a 
                    WHERE a.student_id = s.student_id 
                    ORDER BY a.attendance_date DESC, a.attendance_id DESC 
                    LIMIT 1
                ) AS latest_attendance_status,
                (
                    SELECT a.attendance_date 
                    FROM vsa_attendance a 
                    WHERE a.student_id = s.student_id 
                    ORDER BY a.attendance_date DESC, a.attendance_id DESC 
                    LIMIT 1
                ) AS latest_attendance_date
            FROM vsa_students s
            LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
            WHERE s.batch_id IN ($inPlaceholders) AND s.status = 'Active'
            ORDER BY s.student_name ASC
            LIMIT 15
        ");
        $cStudentsListStmt->execute($assignedBatchIds);
        $coachStudents = [];
        while ($st = $cStudentsListStmt->fetch(PDO::FETCH_ASSOC)) {
            $coachStudents[] = [
                'student_id'               => intval($st['student_id']),
                'student_name'             => $st['student_name'],
                'student_photo'            => $st['student_photo'] ?: '',
                'student_phone'            => $st['student_phone'] ?: '',
                'batch_id'                 => intval($st['batch_id']),
                'batch_name'               => $st['batch_name'] ?: 'Unassigned',
                'status'                   => $st['status'],
                'latest_attendance_status' => $st['latest_attendance_status'] ?: 'No records',
                'latest_attendance_date'   => $st['latest_attendance_date'] ?: ''
            ];
        }

        // Build Coach Response (CRITICAL: Zero financial properties returned)
        $coachResponseData = [
            'role'            => 'coach',
            'user'            => [
                'coach_id' => $coachId,
                'name'     => $currentUser['name'],
                'email'    => $currentUser['email'],
                'photo'    => $currentUser['photo'] ?? ''
            ],
            'user_name'       => $currentUser['name'],
            'generated_at'    => date('Y-m-d H:i:s'),
            'current_date'    => date('l, F j, Y'),
            'kpis'            => [
                'students' => [
                    'total'  => intval($cStudents['total_students'] ?? 0),
                    'active' => intval($cStudents['active_students'] ?? 0)
                ],
                'batches'  => [
                    'total'  => count($assignedBatchIds),
                    'active' => count($assignedBatchIds)
                ],
                'attendance_today' => [
                    'present'         => $cPresentToday,
                    'absent'          => $cAbsentToday,
                    'total'           => $cTotalToday,
                    'batches_marked'  => $cBatchesToday,
                    'attendance_rate' => $cAttRateToday,
                    'has_sessions'    => $cHasSessions
                ]
            ],
            'attendance'      => [
                'present_today'        => $cPresentToday,
                'absent_today'         => $cAbsentToday,
                'batches_marked'       => $cBatchesToday,
                'batches_marked_today' => $cBatchesToday,
                'attendance_rate'      => $cAttRateToday,
                'session_status'       => $cHasSessions ? 'recorded' : 'none',
                'has_sessions_today'   => $cHasSessions,
                'seven_day_trend'      => $cSevenDayTrend
            ],
            'batches'         => [
                'total' => count($coachBatches),
                'list'  => $coachBatches
            ],
            'students'        => [
                'total' => count($coachStudents),
                'list'  => $coachStudents
            ]
        ];

        echo json_encode(array_merge([
            'success' => true,
            'data'    => $coachResponseData
        ], $coachResponseData));
        exit;
    }

    // =========================================================================
    // CASE C: STUDENT DASHBOARD (Personal Athlete Portal)
    // =========================================================================
    if ($currentUser['role'] === 'student') {
        $studentId = $currentUser['student_id'];

        // 1. Resolve Student with Batch and Coach Details
        $stInfoStmt = $pdo->prepare("
            SELECT 
                s.student_id,
                s.student_name,
                s.student_email,
                s.student_phone,
                s.student_photo,
                s.status,
                b.batch_id,
                b.batch_name,
                b.batch_time,
                b.batch_location,
                COALESCE(b.sport, 'Football') AS sport,
                c.coach_id,
                c.coach_name,
                c.coach_email,
                c.coach_phone,
                c.coach_photo
            FROM vsa_students s
            LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            WHERE s.student_id = ?
            LIMIT 1
        ");
        $stInfoStmt->execute([$studentId]);
        $stInfo = $stInfoStmt->fetch(PDO::FETCH_ASSOC);

        if (!$stInfo) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error'   => 'Student profile data could not be located.'
            ]);
            exit;
        }

        // 2. Personal Attendance Statistics
        $stAttStmt = $pdo->prepare("
            SELECT 
                COUNT(attendance_id) AS total_sessions,
                COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present_count,
                COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_count
            FROM vsa_attendance
            WHERE student_id = ?
        ");
        $stAttStmt->execute([$studentId]);
        $attRow = $stAttStmt->fetch(PDO::FETCH_ASSOC);

        $stPresent = intval($attRow['present_count'] ?? 0);
        $stAbsent  = intval($attRow['absent_count'] ?? 0);
        $stTotal   = intval($attRow['total_sessions'] ?? 0);
        $stAttRate = ($stPresent + $stAbsent > 0) ? round(($stPresent / ($stPresent + $stAbsent)) * 100, 1) : null;

        // 3. Student Scoped Attendance Records (Chronological & Full History)
        $stAllStmt = $pdo->prepare("
            SELECT 
                a.attendance_id,
                a.attendance_date,
                a.status,
                COALESCE(b.batch_name, 'Training Batch') AS batch_name
            FROM vsa_attendance a
            LEFT JOIN vsa_batches b ON a.batch_id = b.batch_id
            WHERE a.student_id = ?
            ORDER BY a.attendance_date DESC, a.attendance_id DESC
        ");
        $stAllStmt->execute([$studentId]);
        $stAllAttendance = [];
        while ($row = $stAllStmt->fetch(PDO::FETCH_ASSOC)) {
            $dt = $row['attendance_date'];
            $stAllAttendance[] = [
                'attendance_id'   => intval($row['attendance_id']),
                'attendance_date' => $dt,
                'date_formatted'  => date('M j, Y', strtotime($dt)),
                'date_short'      => date('M j', strtotime($dt)),
                'day_name'        => date('D', strtotime($dt)),
                'batch_name'      => $row['batch_name'],
                'status'          => $row['status']
            ];
        }

        // 4. Chronological Timeline (Latest up to 7 recorded sessions, ordered past -> present)
        $stLatest7 = array_slice($stAllAttendance, 0, 7);
        $stTimeline = array_reverse($stLatest7);

        // Keep 7-day trend array for backward compatibility
        $stSevenDayTrend = [];
        foreach ($stTimeline as $item) {
            $stSevenDayTrend[] = [
                'date'           => $item['attendance_date'],
                'date_label'     => $item['date_short'],
                'date_formatted' => $item['date_short'],
                'day_name'       => $item['day_name'],
                'present'        => ($item['status'] === 'Present') ? 1 : 0,
                'absent'         => ($item['status'] === 'Absent')  ? 1 : 0,
                'status'         => $item['status'],
                'batch_name'     => $item['batch_name']
            ];
        }

        // 5. Compact Recent Attendance (First 4 latest records for summary preview)
        $stRecentAttendance = array_slice($stAllAttendance, 0, 4);

        // 6. Student Personal Fees & Payment Records (Scoped strictly to authenticated student)
        updateOverdueStatuses($pdo);
        $stFeesStmt = $pdo->prepare("
            SELECT 
                fee_id,
                student_id,
                batch_id,
                fee_month,
                due_date,
                fee_amount,
                payment_status,
                razorpay_order_id,
                razorpay_payment_id,
                payment_method,
                paid_amount,
                paid_at
            FROM vsa_student_fees
            WHERE student_id = ?
            ORDER BY fee_month ASC, fee_id ASC
        ");
        $stFeesStmt->execute([$studentId]);
        $rawFeeRows = $stFeesStmt->fetchAll(PDO::FETCH_ASSOC);

        $currentMonthDate = date('Y-m-01');
        $currentMonthLabel = date('F Y');
        $currentMonthShort = strtoupper(date('M'));
        $currentMonthName = date('F');

        $totalExpectedMonths = count($rawFeeRows);
        $paidMonthsCount = 0;
        $dueMonthsCount = 0;
        $monthlyRecords = [];
        $currentMonthRecord = null;

        foreach ($rawFeeRows as $f) {
            $isPaid = ($f['payment_status'] === 'Paid');
            if ($isPaid) {
                $paidMonthsCount++;
            } else {
                $dueMonthsCount++;
            }

            $feeMonthVal = $f['fee_month'];
            $isCurMonth = ($feeMonthVal === $currentMonthDate);

            $monthObj = [
                'fee_id'              => intval($f['fee_id']),
                'fee_month'           => $feeMonthVal,
                'month_name'          => date('F', strtotime($feeMonthVal)),
                'month_short'         => strtoupper(date('M', strtotime($feeMonthVal))),
                'year'                => date('Y', strtotime($feeMonthVal)),
                'month_label'         => date('F Y', strtotime($feeMonthVal)),
                'due_date'            => date('d/m/Y', strtotime($f['due_date'])),
                'fee_amount'          => floatval($f['fee_amount']),
                'status'              => $isPaid ? 'PAID' : 'DUE', // STRICT BINARY: 'PAID' or 'DUE'
                'raw_status'          => $f['payment_status'],
                'is_current_month'    => $isCurMonth,
                'paid_at'             => $f['paid_at'] ? date('d M Y, h:i A', strtotime($f['paid_at'])) : null,
                'paid_date_formatted' => $f['paid_at'] ? date('d M Y', strtotime($f['paid_at'])) : null,
                'paid_amount'         => ($f['paid_amount'] !== null && $f['paid_amount'] !== '') ? floatval($f['paid_amount']) : null,
                'payment_method'      => !empty($f['payment_method']) ? $f['payment_method'] : null,
                'payment_reference'   => !empty($f['razorpay_payment_id']) ? $f['razorpay_payment_id'] : null,
                'order_id'            => !empty($f['razorpay_order_id']) ? $f['razorpay_order_id'] : null
            ];

            if ($isCurMonth) {
                $currentMonthRecord = $monthObj;
            }

            $monthlyRecords[] = $monthObj;
        }

        // Determine current month status
        $currentMonthStatus = 'Not Applicable';
        $currentMonthStatusText = 'No record for current month';
        if ($currentMonthRecord !== null) {
            if ($currentMonthRecord['status'] === 'PAID') {
                $currentMonthStatus = 'PAID';
                $currentMonthStatusText = '✓ Paid';
            } else {
                $currentMonthStatus = 'DUE';
                $currentMonthStatusText = '✕ Payment Due';
            }
        }

        $feesData = [
            'has_fees'             => ($totalExpectedMonths > 0),
            'total_expected'       => $totalExpectedMonths,
            'paid_count'           => $paidMonthsCount,
            'due_count'            => $dueMonthsCount,
            'percentage_paid'      => ($totalExpectedMonths > 0) ? round(($paidMonthsCount / $totalExpectedMonths) * 100) : 0,
            'current_month'        => [
                'date'             => $currentMonthDate,
                'label'            => $currentMonthLabel,
                'name'             => $currentMonthName,
                'short'            => $currentMonthShort,
                'has_record'       => ($currentMonthRecord !== null),
                'status'           => $currentMonthStatus, // 'PAID', 'DUE', or 'Not Applicable'
                'status_text'      => $currentMonthStatusText
            ],
            'months'               => $monthlyRecords
        ];

        // Build Student Response (Personal Athlete Portal - Scoped strictly to student)
        $studentResponseData = [
            'role'            => 'student',
            'user'            => [
                'student_id' => $studentId,
                'name'       => $currentUser['name'],
                'email'      => $currentUser['email'],
                'photo'      => $stInfo['student_photo'] ?: ($currentUser['photo'] ?? '')
            ],
            'user_name'       => $currentUser['name'],
            'generated_at'    => date('Y-m-d H:i:s'),
            'current_date'    => date('l, F j, Y'),
            'kpis'            => [
                'batch'                   => $stInfo['batch_name'] ?: 'No Batch Assigned',
                'attendance_rate'         => $stAttRate,
                'sessions_attended'       => $stPresent,
                'total_sessions'          => $stTotal,
                'absent_sessions'         => $stAbsent,
                'sport'                   => $stInfo['sport'] ?: 'Football',
                'fees_ratio'              => ($totalExpectedMonths > 0) ? "{$paidMonthsCount} / {$totalExpectedMonths}" : "No records",
                'fees_summary'            => ($totalExpectedMonths > 0) ? "{$paidMonthsCount} / {$totalExpectedMonths} MONTHS PAID" : "No records",
                'fees_current_month_name' => $currentMonthName,
                'fees_current_status'     => $currentMonthStatus,
                'fees_current_status_text'=> $currentMonthStatusText,
                'fees_paid_count'         => $paidMonthsCount,
                'fees_total_count'        => $totalExpectedMonths,
                'fees_due_count'          => $dueMonthsCount
            ],
            'batch'           => [
                'batch_id'       => intval($stInfo['batch_id'] ?? 0),
                'batch_name'     => $stInfo['batch_name'] ?: 'No Batch Assigned',
                'coach_id'       => intval($stInfo['coach_id'] ?? 0),
                'coach_name'     => $stInfo['coach_name'] ?: 'Unassigned',
                'coach_email'    => $stInfo['coach_email'] ?: '',
                'coach_phone'    => $stInfo['coach_phone'] ?: '',
                'coach_photo'    => $stInfo['coach_photo'] ?: '',
                'batch_location' => $stInfo['batch_location'] ?: 'Academy Grounds',
                'batch_time'     => $stInfo['batch_time'] ?: 'Flexible Schedule',
                'sport'          => $stInfo['sport'] ?: 'Football'
            ],
            'attendance'      => [
                'rate'            => $stAttRate,
                'present'         => $stPresent,
                'absent'          => $stAbsent,
                'total'           => $stTotal,
                'timeline'        => $stTimeline,
                'seven_day_trend' => $stSevenDayTrend,
                'recent'          => $stRecentAttendance,
                'history'         => $stAllAttendance
            ],
            'fees'            => $feesData
        ];

        echo json_encode(array_merge([
            'success' => true,
            'data'    => $studentResponseData
        ], $studentResponseData));
        exit;
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Database error encountered while compiling dashboard analytics: ' . $e->getMessage()
    ]);
    exit;
}
