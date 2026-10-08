<?php
/**
 * VAVA Sports Academy - Centralized Authentication, Session & CORS Guard
 * 
 * Provides unified, authoritative server-side session authentication,
 * environment-aware cookie hardening, dynamic CORS reflection, and role verification.
 */

if (!function_exists('startSecureSession')) {
    function startSecureSession() {
        if (session_status() === PHP_SESSION_NONE) {
            $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                       || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)
                       || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

            @ini_set('session.use_strict_mode', '1');
            @ini_set('session.use_only_cookies', '1');

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
            session_start();
        }
    }
}

if (!function_exists('applyCorsHeaders')) {
    function applyCorsHeaders($allowedMethods = 'GET, POST, PUT, DELETE, OPTIONS') {
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
        header("Access-Control-Allow-Methods: {$allowedMethods}");
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID, X-VAVA-Coach-Id, X-VAVA-Student-ID, X-VAVA-Student-Id, X-VAVA-Actor-Name, X-Requested-With, Accept, Origin');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            if ($isAllowedOrigin) {
                header('Access-Control-Max-Age: 86400');
                http_response_code(200);
            } else {
                http_response_code(403);
            }
            exit;
        }

        return $isAllowedOrigin;
    }
}

if (!function_exists('getAuthenticatedSessionUser')) {
    /**
     * Resolves currently authenticated user strictly from server-side PHP session.
     * Never trusts client headers or query parameters to forge or elevate roles.
     * Never falls back to arbitrary/first database records.
     */
    function getAuthenticatedSessionUser($pdo) {
        startSecureSession();

        $sessionRole  = !empty($_SESSION['user_role']) ? strtolower(trim($_SESSION['user_role'])) : '';
        $sessionEmail = !empty($_SESSION['user_email']) ? strtolower(trim($_SESSION['user_email'])) : '';
        $adminId      = intval($_SESSION['admin_id'] ?? 0);
        $coachId      = intval($_SESSION['coach_id'] ?? 0);
        $studentId    = intval($_SESSION['student_id'] ?? 0);

        if (empty($sessionRole) || empty($sessionEmail)) {
            return null;
        }

        $userId       = intval($_SESSION['user_id'] ?? 0);
        if ($userId <= 0 && !empty($sessionEmail)) {
            try {
                $uStmt = $pdo->prepare("SELECT user_id FROM vsa_users WHERE email = ? LIMIT 1");
                $uStmt->execute([$sessionEmail]);
                $userId = intval($uStmt->fetchColumn() ?: 0);
            } catch (Exception $e) {
                $userId = 0;
            }
        }

        // 1. SUPER ADMIN / ADMIN
        if ($sessionRole === 'admin' || $sessionRole === 'superadmin' || $sessionRole === 'super admin') {
            $stmt = $pdo->prepare("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE LOWER(TRIM(REPLACE(REPLACE(admin_email, '\r', ''), '\n', ''))) = ? LIMIT 1");
            $stmt->execute([$sessionEmail]);
            $admin = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$admin && $adminId > 0) {
                $stmt = $pdo->prepare("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE admin_id = ? LIMIT 1");
                $stmt->execute([$adminId]);
                $admin = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($admin) {
                return [
                    'user_id'    => $userId,
                    'role'       => 'admin',
                    'admin_id'   => intval($admin['admin_id']),
                    'name'       => $admin['admin_name'] ?: 'Super Admin',
                    'email'      => $admin['admin_email'],
                    'user_email' => $admin['admin_email'],
                    'admin'      => $admin
                ];
            }
            return null;
        }

        // 2. COACH
        if ($sessionRole === 'coach') {
            $query = '
                SELECT 
                    c.coach_id,
                    c.coach_name,
                    c.coach_email,
                    c.coach_phone,
                    c.batch_id,
                    c.coach_photo,
                    COALESCE(NULLIF(c.batch_name, ""), b.batch_name, "Unassigned") AS batch_name
                FROM vsa_coaches c
                LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
            ';

            $coach = null;
            if ($coachId > 0) {
                $stmt = $pdo->prepare($query . ' WHERE c.coach_id = ? LIMIT 1');
                $stmt->execute([$coachId]);
                $coach = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$coach && !empty($sessionEmail)) {
                $stmt = $pdo->prepare($query . ' WHERE LOWER(TRIM(c.coach_email)) = ? LIMIT 1');
                $stmt->execute([$sessionEmail]);
                $coach = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($coach) {
                return [
                    'user_id'    => $userId,
                    'role'       => 'coach',
                    'coach_id'   => intval($coach['coach_id']),
                    'name'       => $coach['coach_name'] ?: 'Coach',
                    'email'      => $coach['coach_email'],
                    'user_email' => $coach['coach_email'],
                    'batch_id'   => intval($coach['batch_id'] ?? 0),
                    'batch_name' => $coach['batch_name'] ?? 'Unassigned',
                    'photo'      => $coach['coach_photo'] ?? '',
                    'coach'      => $coach
                ];
            }
            return null;
        }

        // 3. STUDENT
        if ($sessionRole === 'student') {
            $student = null;
            if ($studentId > 0) {
                $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE student_id = ? LIMIT 1');
                $stmt->execute([$studentId]);
                $student = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$student && !empty($sessionEmail)) {
                $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE LOWER(TRIM(student_email)) = ? LIMIT 1');
                $stmt->execute([$sessionEmail]);
                $student = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($student) {
                return [
                    'user_id'    => $userId,
                    'role'       => 'student',
                    'student_id' => intval($student['student_id']),
                    'name'       => $student['student_name'] ?: 'Student',
                    'email'      => $student['student_email'],
                    'user_email' => $student['student_email'],
                    'batch_id'   => intval($student['batch_id'] ?? 0),
                    'coach_id'   => intval($student['coach_id'] ?? 0),
                    'photo'      => $student['student_photo'] ?? '',
                    'student'    => $student,
                    'raw'        => $student
                ];
            }
            return null;
        }

        return null;
    }
}

if (!function_exists('requireAuthSession')) {
    /**
     * Enforces that a valid session exists. Optionally checks that role is in $allowedRoles.
     * Exits with HTTP 401 (unauthenticated) or 403 (unauthorized) and valid JSON on failure.
     */
    function requireAuthSession($pdo, array $allowedRoles = []) {
        $user = getAuthenticatedSessionUser($pdo);
        if (!$user) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'error'   => 'Authentication required. Please log in.'
            ]);
            exit;
        }

        if (!empty($allowedRoles)) {
            $roleClean = strtolower($user['role']);
            $normalizedAllowed = array_map(function($r) {
                $r = strtolower(trim($r));
                return ($r === 'superadmin' || $r === 'super admin') ? 'admin' : $r;
            }, $allowedRoles);

            $checkRole = ($roleClean === 'superadmin' || $roleClean === 'super admin') ? 'admin' : $roleClean;
            if (!in_array($checkRole, $normalizedAllowed, true)) {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'error'   => 'Access denied. You do not have permission to access this resource.'
                ]);
                exit;
            }
        }

        return $user;
    }
}
?>
