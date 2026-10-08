<?php
/**
 * VAVA Sports Academy - Students API
 * Handles GET (fetch all / single / note), POST (create / photo / save_note / delete_note), PUT (update), DELETE (delete student)
 */

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

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
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

/**
 * Ensure student_note TEXT NULL column exists in vsa_students,
 * and ensure any separate notes table is permanently dropped.
 */
function ensureStudentNoteColumn($pdo) {
    static $ensured = false;
    if ($ensured) return;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM vsa_students LIKE 'student_note'");
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE vsa_students ADD COLUMN student_note TEXT NULL DEFAULT NULL");
        }
        // Drop separate notes table if it exists
        $pdo->exec("DROP TABLE IF EXISTS vsa_student_notes");
        $ensured = true;
    } catch (Exception $e) {}
}
ensureStudentNoteColumn($pdo);

/**
 * Resolve authenticated user and identity from authoritative session (or validated headers)
 */
function resolveUser($pdo, $input = []) {
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

    // Unauthenticated requests are strictly rejected
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
            echo json_encode(['error' => 'Student authorization failed or student record not found.']);
            exit;
        }

        return [
            'role'       => 'student',
            'student_id' => intval($student['student_id']),
            'email'      => $student['student_email'],
            'student'    => $student
        ];
    }

    // ── ROLE: COACH ──────────────────────────────────────────────────────────
    if ($effectiveRole === 'coach') {
        $coach = null;
        $query = '
            SELECT 
                c.coach_id,
                c.coach_name,
                c.coach_email,
                c.batch_id,
                COALESCE(NULLIF(c.batch_name, ""), b.batch_name, "") AS batch_name
            FROM vsa_coaches c
            LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
        ';

        if (!empty($effectiveEmail)) {
            $stmt = $pdo->prepare($query . ' WHERE LOWER(TRIM(c.coach_email)) = ? LIMIT 1');
            $stmt->execute([$effectiveEmail]);
            $coach = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        if (!$coach && $sessionCoachId > 0) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_id = ? LIMIT 1');
            $stmt->execute([$sessionCoachId]);
            $coach = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$coach) {
            http_response_code(403);
            echo json_encode(['error' => 'Coach authorization failed or coach record not found.']);
            exit;
        }

        return ['role' => 'coach', 'coach' => $coach];
    }

    // ── ROLE: SUPER ADMIN ────────────────────────────────────────────────────
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
            return ['role' => 'admin', 'admin' => $admin];
        }
    }

    // Unauthenticated or unknown role: reject access
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required.']);
    exit;
}

/**
 * Check if a student record belongs to the coach\'s assigned batch
 */
function isStudentInCoachBatch($student, $coach, $pdo = null) {
    if (!$student || !$coach) return false;
    $coachId = intval($coach['coach_id'] ?? 0);
    $coachBatchId = intval($coach['batch_id'] ?? 0);
    $coachBatchName = strtolower(trim($coach['batch_name'] ?? ''));

    $studentBatchId = intval($student['batch_id'] ?? 0);
    $studentBatchName = strtolower(trim($student['batch_name'] ?? ''));

    if ($coachBatchId > 0 && $studentBatchId > 0 && $coachBatchId === $studentBatchId) {
        return true;
    }
    if (!empty($coachBatchName) && !empty($studentBatchName) && $coachBatchName === $studentBatchName) {
        return true;
    }

    if ($pdo && $coachId > 0) {
        try {
            $chk = $pdo->prepare('SELECT batch_id FROM vsa_batches WHERE coach_id = ? AND (batch_id = ? OR LOWER(TRIM(batch_name)) = ?)');
            $chk->execute([$coachId, $studentBatchId, $studentBatchName]);
            if ($chk->fetch()) {
                return true;
            }
        } catch (Exception $e) {}
    }

    return false;
}

/**
 * Save client-optimized student profile photo to uploads/students/
 */
function saveOptimizedStudentPhoto($pdo, $student_id, $image_data) {
    if (!$student_id || empty($image_data)) return null;

    $uploadDir = __DIR__ . '/../uploads/students/';
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    if (preg_match('/^data:image\/(\w+);base64,/', $image_data, $type)) {
        $image_data = substr($image_data, strpos($image_data, ',') + 1);
        $ext = strtolower($type[1]);
        if ($ext === 'jpeg') $ext = 'jpg';
    } else {
        $ext = 'jpg';
    }

    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
        $ext = 'jpg';
    }

    $decoded = base64_decode($image_data);
    if ($decoded === false || strlen($decoded) === 0) {
        return null;
    }

    if (strlen($decoded) > 5 * 1024 * 1024) {
        return null;
    }

    $filename = 'student_' . $student_id . '_' . time() . '_' . rand(100, 999) . '.' . $ext;
    $filepath = $uploadDir . $filename;
    $relativePath = 'uploads/students/' . $filename;

    if (file_put_contents($filepath, $decoded) === false) {
        return null;
    }

    try {
        // Fetch old photo path before updating
        $stmtOld = $pdo->prepare('SELECT student_photo FROM vsa_students WHERE student_id = ?');
        $stmtOld->execute([$student_id]);
        $oldStudent = $stmtOld->fetch();

        // Update database record
        $stmt = $pdo->prepare('UPDATE vsa_students SET student_photo = ? WHERE student_id = ?');
        $stmt->execute([$relativePath, $student_id]);

        // Clean up old file only after new photo is safely stored and recorded
        if ($oldStudent && !empty($oldStudent['student_photo'])) {
            $oldFile = __DIR__ . '/../' . $oldStudent['student_photo'];
            if (file_exists($oldFile) && realpath($oldFile) !== realpath($filepath)) {
                @unlink($oldFile);
            }
        }

        return $relativePath;
    } catch (PDOException $e) {
        if (file_exists($filepath)) {
            @unlink($filepath);
        }
        return null;
    }
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET: fetch all students, single student by ID, or student note ──────────
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $id = intval($_GET['id'] ?? 0);
    $user = resolveUser($pdo);

    // ── ROLE: STUDENT (Personal Profile Scoped, Zero List Access, No Notes) ──
    if ($user['role'] === 'student') {
        if ($action === 'get_note') {
            http_response_code(403);
            echo json_encode(['error' => 'Students are not authorized to view notes.']);
            exit;
        }

        // Student identity is strictly anchored to authoritative session identity.
        // Any client-supplied ID or query parameters are ignored so Student A can NEVER view Student B.
        echo json_encode([
            'success' => true,
            'student' => $user['student']
        ]);
        exit;
    }

    // Action: get_note
    if ($action === 'get_note') {
        $student_id = intval($_GET['student_id'] ?? $id);
        if (!$student_id) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id is required.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT student_id, batch_id, batch_name, student_note FROM vsa_students WHERE student_id = ?');
        $stmt->execute([$student_id]);
        $student = $stmt->fetch();
        if (!$student) {
            http_response_code(404);
            echo json_encode(['error' => 'Student not found.']);
            exit;
        }

        if ($user['role'] === 'coach') {
            if (!isStudentInCoachBatch($student, $user['coach'], $pdo)) {
                http_response_code(403);
                echo json_encode(['error' => 'Unauthorized: You can only view notes for students in your assigned batch.']);
                exit;
            }
        }

        echo json_encode([
            'success'      => true,
            'student_note' => $student['student_note'] ?: null
        ]);
        exit;
    }

    try {
        if ($id > 0) {
            $stmt = $pdo->prepare('SELECT * FROM vsa_students WHERE student_id = ?');
            $stmt->execute([$id]);
            $student = $stmt->fetch();
            if (!$student) {
                http_response_code(404);
                echo json_encode(['error' => 'Student not found.']);
                exit;
            }

            if ($user['role'] === 'coach') {
                if (!isStudentInCoachBatch($student, $user['coach'], $pdo)) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Unauthorized: This student does not belong to your assigned batch.']);
                    exit;
                }
            }

            echo json_encode(['success' => true, 'student' => $student]);
        } else {
            // Fetch all students (coach batch-restricted vs superadmin all)
            if ($user['role'] === 'coach') {
                $coachId = intval($user['coach']['coach_id'] ?? 0);
                $assignedBatchId = intval($user['coach']['batch_id'] ?? 0);
                $assignedBatchName = trim($user['coach']['batch_name'] ?? '');

                $stmt = $pdo->prepare('
                    SELECT s.* FROM vsa_students s
                    WHERE (s.batch_id IN (SELECT b.batch_id FROM vsa_batches b WHERE b.coach_id = ? OR b.batch_id = ?))
                       OR (s.batch_name IN (SELECT b.batch_name FROM vsa_batches b WHERE b.coach_id = ? OR b.batch_id = ?))
                       OR (? > 0 AND s.batch_id = ?)
                       OR (s.batch_name IS NOT NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(?)))
                    ORDER BY s.student_id DESC
                ');
                $stmt->execute([
                    $coachId, $assignedBatchId,
                    $coachId, $assignedBatchId,
                    $assignedBatchId, $assignedBatchId,
                    $assignedBatchName
                ]);
                $students = $stmt->fetchAll();
            } else {
                $stmt = $pdo->query('SELECT * FROM vsa_students ORDER BY student_id DESC');
                $students = $stmt->fetchAll();
            }

            echo json_encode(['success' => true, 'students' => $students]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ── POST: register a new student, handle photo actions, or manage student note
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $input['action'] ?? '';
    $user = resolveUser($pdo, $input);

    // Students have read-only access and cannot perform any POST actions
    if ($user['role'] === 'student') {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: Students are not authorized to perform administrative actions.']);
        exit;
    }

    // ── 1. Action: save_note / add_note / edit_note (One student = One note)
    if ($action === 'save_note' || $action === 'add_note' || $action === 'edit_note') {
        if ($user['role'] === 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Super Admin has read-only access to student notes.']);
            exit;
        }
        if ($user['role'] !== 'coach') {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized: Only assigned coaches can manage student notes.']);
            exit;
        }

        $student_id = intval($input['student_id'] ?? 0);
        $note_content = trim($input['student_note'] ?? $input['note_content'] ?? '');

        if (!$student_id) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id is required.']);
            exit;
        }
        if ($note_content === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Note content cannot be empty.']);
            exit;
        }

        // Validate student exists and belongs to coach's batch
        $stmtS = $pdo->prepare('SELECT student_id, batch_id, batch_name, student_note FROM vsa_students WHERE student_id = ?');
        $stmtS->execute([$student_id]);
        $student = $stmtS->fetch();
        if (!$student) {
            http_response_code(404);
            echo json_encode(['error' => 'Student not found.']);
            exit;
        }
        if (!isStudentInCoachBatch($student, $user['coach'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized: You can only manage notes for students in your assigned batch.']);
            exit;
        }

        // Update student note directly in vsa_students table
        try {
            $stmtUpdate = $pdo->prepare('UPDATE vsa_students SET student_note = ? WHERE student_id = ?');
            $stmtUpdate->execute([$note_content, $student_id]);

            recordActivity($pdo, 'STUDENT', 'Updated', 'Student', $student_id, "Student #{$student_id}", "Updated coach training notes for Student #{$student_id}", [
                'student_id'   => $student_id,
                'student_note' => $note_content
            ], $input);

            echo json_encode([
                'success'      => true,
                'message'      => !empty($student['student_note']) ? 'Note updated successfully.' : 'Note added successfully.',
                'student_note' => $note_content
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save note: ' . $e->getMessage()]);
        }
        exit;
    }

    // ── 2. Action: delete_note
    if ($action === 'delete_note') {
        if ($user['role'] === 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Super Admin has read-only access to student notes.']);
            exit;
        }
        if ($user['role'] !== 'coach') {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized: Only assigned coaches can manage student notes.']);
            exit;
        }

        $student_id = intval($input['student_id'] ?? 0);
        if (!$student_id) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id is required.']);
            exit;
        }

        // Validate student exists and belongs to coach's batch
        $stmtS = $pdo->prepare('SELECT student_id, batch_id, batch_name FROM vsa_students WHERE student_id = ?');
        $stmtS->execute([$student_id]);
        $student = $stmtS->fetch();
        if (!$student) {
            http_response_code(404);
            echo json_encode(['error' => 'Student not found.']);
            exit;
        }
        if (!isStudentInCoachBatch($student, $user['coach'])) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized: You can only manage notes for students in your assigned batch.']);
            exit;
        }

        try {
            $stmtClear = $pdo->prepare('UPDATE vsa_students SET student_note = NULL WHERE student_id = ?');
            $stmtClear->execute([$student_id]);

            echo json_encode([
                'success'      => true,
                'message'      => 'Student note deleted successfully.',
                'student_note' => null
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete note: ' . $e->getMessage()]);
        }
        exit;
    }

    // ── 3. Handle Upload Photo
    if ($action === 'upload_photo') {
        $student_id = intval($input['student_id'] ?? 0);
        $image_data = $input['image_data'] ?? $input['student_photo'] ?? '';

        if (!$student_id || !$image_data) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id and image_data are required.']);
            exit;
        }

        if ($user['role'] === 'coach') {
            $stmtS = $pdo->prepare('SELECT student_id, batch_id, batch_name FROM vsa_students WHERE student_id = ?');
            $stmtS->execute([$student_id]);
            $st = $stmtS->fetch();
            if (!$st || !isStudentInCoachBatch($st, $user['coach'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Unauthorized: You can only upload photos for students in your assigned batch.']);
                exit;
            }
        }

        $savedPhoto = saveOptimizedStudentPhoto($pdo, $student_id, $image_data);
        if (!$savedPhoto) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save optimized photo on server.']);
            exit;
        }

        echo json_encode(['success' => true, 'student_photo' => $savedPhoto]);
        exit;
    }

    // ── 4. Handle Delete Photo
    if ($action === 'delete_photo') {
        $student_id = intval($input['student_id'] ?? 0);
        if (!$student_id) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id is required.']);
            exit;
        }

        if ($user['role'] === 'coach') {
            $stmtS = $pdo->prepare('SELECT student_id, batch_id, batch_name FROM vsa_students WHERE student_id = ?');
            $stmtS->execute([$student_id]);
            $st = $stmtS->fetch();
            if (!$st || !isStudentInCoachBatch($st, $user['coach'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Unauthorized: You can only delete photos for students in your assigned batch.']);
                exit;
            }
        }

        try {
            $stmtOld = $pdo->prepare('SELECT student_photo FROM vsa_students WHERE student_id = ?');
            $stmtOld->execute([$student_id]);
            $student = $stmtOld->fetch();
            if ($student && !empty($student['student_photo'])) {
                $oldFile = __DIR__ . '/../' . $student['student_photo'];
                if (file_exists($oldFile)) {
                    @unlink($oldFile);
                }
            }
            $stmt = $pdo->prepare('UPDATE vsa_students SET student_photo = NULL WHERE student_id = ?');
            $stmt->execute([$student_id]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete photo: ' . $e->getMessage()]);
        }
        exit;
    }

    // ── 5. Student Registration (Super Admin Only)
    if ($user['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: Only Super Admin can register new students.']);
        exit;
    }

    $student_name             = trim($input['student_name']             ?? '');
    $parent_name              = trim($input['parent_name']              ?? '');
    $date_of_birth            = trim($input['date_of_birth']            ?? '');
    $gender                   = trim($input['gender']                   ?? '');
    $blood_group              = trim($input['blood_group']              ?? '');
    $branch_name              = trim($input['branch_name']              ?? '');
    $raw_batch_id             = intval($input['batch_id']               ?? 0);
    $batch_name               = trim($input['batch_name']               ?? '');
    $coach_id                 = intval($input['coach_id']               ?? 0);
    $coach_name               = trim($input['coach_name']               ?? '');
    $address                  = trim($input['address']                  ?? '');
    $city                     = trim($input['city']                     ?? '');
    $postal_code              = trim($input['postal_code']              ?? '');
    $father_contact_number    = trim($input['father_contact_number']    ?? '');
    $mother_contact_number    = trim($input['mother_contact_number']    ?? '');
    $emergency_contact_number = trim($input['emergency_contact_number'] ?? '');
    $whatsapp_number          = trim($input['whatsapp_number']          ?? '');

    $student_email            = trim($input['student_email']            ?? '');
    $school_name              = trim($input['school_name']              ?? '');
    $student_phone            = trim($input['student_phone']            ?? $father_contact_number);
    $joined_date              = trim($input['joined_date']              ?? date('Y-m-d'));
    $status                   = trim($input['status']                   ?? 'Active');
    $student_note             = trim($input['student_note']             ?? '');

    if (!$student_name || !$parent_name || !$branch_name || !$city || !$father_contact_number || !$school_name) {
        http_response_code(400);
        echo json_encode(['error' => 'All required fields must be filled.']);
        exit;
    }

    if ($student_email && !filter_var($student_email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid email address format.']);
        exit;
    }

    // Validate batch existence and resolve batch_id / batch_name / coach_id
    $batch_id = null;
    if ($raw_batch_id > 0) {
        $bStmt = $pdo->prepare('
            SELECT b.batch_id, b.batch_name, b.coach_id, c.coach_name 
            FROM vsa_batches b
            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            WHERE b.batch_id = ?
        ');
        $bStmt->execute([$raw_batch_id]);
        $bRow = $bStmt->fetch(PDO::FETCH_ASSOC);
        if (!$bRow) {
            http_response_code(400);
            echo json_encode(['error' => 'Selected batch does not exist.']);
            exit;
        }
        $batch_id = intval($bRow['batch_id']);
        $batch_name = $bRow['batch_name'];
        if (!empty($bRow['coach_id'])) {
            $coach_id = intval($bRow['coach_id']);
            if (empty($coach_name)) {
                $coach_name = $bRow['coach_name'] ?? '';
            }
        }
    } else {
        $batch_id = null;
        if (empty($batch_name) || $batch_name === '0') {
            $batch_name = 'No Batch';
        }
    }

    if ($coach_id <= 0 && !empty($coach_name)) {
        $cStmt = $pdo->prepare('SELECT coach_id FROM vsa_coaches WHERE LOWER(TRIM(coach_name)) = LOWER(TRIM(?))');
        $cStmt->execute([$coach_name]);
        $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
        if ($cRow) {
            $coach_id = intval($cRow['coach_id']);
        }
    }

    // Auto-generate email if empty to satisfy UNIQUE constraint
    if (!$student_email) {
        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $student_name));
        $student_email = $slug . '_' . time() . rand(10, 99) . '@vavasports.local';
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO vsa_students (
                student_name, student_email, school_name, student_phone, address, date_of_birth, joined_date, status,
                parent_name, gender, blood_group, branch_name, coach_id, coach_name, batch_id, batch_name, city, postal_code,
                father_contact_number, mother_contact_number, emergency_contact_number, whatsapp_number, student_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $student_name, $student_email, $school_name ?: null, $student_phone, $address, $date_of_birth ?: null, $joined_date, $status,
            $parent_name, $gender, $blood_group, $branch_name, ($coach_id > 0 ? $coach_id : null), $coach_name, ($batch_id > 0 ? $batch_id : null), $batch_name, $city, $postal_code,
            $father_contact_number, $mother_contact_number ?: null, $emergency_contact_number, $whatsapp_number,
            $student_note ?: null
        ]);
        $newId = $pdo->lastInsertId();

        $batchInfo = $batch_name ?: 'No Batch';
        if ($batch_id > 0) {
            $batchInfo = "Batch #{$batch_id} ({$batch_name})";
        }
        $desc = "Enrolled student {$student_name} (ID: #{$newId}) in {$batchInfo}";
        if ($coach_name) {
            $desc .= " with Coach {$coach_name}";
        }
        recordActivity($pdo, 'STUDENT', 'Created', 'Student', $newId, $student_name, $desc, [
            'student_id'   => $newId,
            'student_name' => $student_name,
            'batch_id'     => $batch_id,
            'batch_name'   => $batch_name,
            'coach_name'   => $coach_name,
            'branch_name'  => $branch_name,
            'status'       => $status
        ], $input);

        $imageData = $input['image_data'] ?? $input['student_photo'] ?? '';
        $savedPhoto = null;
        if (!empty($imageData)) {
            $savedPhoto = saveOptimizedStudentPhoto($pdo, $newId, $imageData);
        }

        echo json_encode([
            'success' => true,
            'student_id' => $newId,
            'student_photo' => $savedPhoto
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save student: ' . $e->getMessage()]);
    }
    exit;
}

// ── PUT: update an existing student (Super Admin Only) ───────────────────────
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $user = resolveUser($pdo, $input);

    if ($user['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: Only Super Admin can update students.']);
        exit;
    }

    $student_id               = intval($input['student_id'] ?? $_GET['id'] ?? 0);
    $student_name             = trim($input['student_name']             ?? '');
    $parent_name              = trim($input['parent_name']              ?? '');
    $date_of_birth            = trim($input['date_of_birth']            ?? '');
    $gender                   = trim($input['gender']                   ?? '');
    $blood_group              = trim($input['blood_group']              ?? '');
    $branch_name              = trim($input['branch_name']              ?? '');
    $raw_batch_id             = intval($input['batch_id']               ?? 0);
    $batch_name               = trim($input['batch_name']               ?? '');
    $coach_id                 = intval($input['coach_id']               ?? 0);
    $coach_name               = trim($input['coach_name']               ?? '');
    $address                  = trim($input['address']                  ?? '');
    $city                     = trim($input['city']                     ?? '');
    $postal_code              = trim($input['postal_code']              ?? '');
    $father_contact_number    = trim($input['father_contact_number']    ?? '');
    $mother_contact_number    = trim($input['mother_contact_number']    ?? '');
    $emergency_contact_number = trim($input['emergency_contact_number'] ?? '');
    $whatsapp_number          = trim($input['whatsapp_number']          ?? '');
    $student_email            = trim($input['student_email']            ?? '');
    $school_name              = trim($input['school_name']              ?? '');
    $student_phone            = trim($input['student_phone']            ?? $father_contact_number);
    $status                   = trim($input['status']                   ?? 'Active');

    if (!$student_id || !$student_name || !$parent_name || !$branch_name || !$city || !$father_contact_number || !$school_name) {
        http_response_code(400);
        echo json_encode(['error' => 'student_id and required fields are required.']);
        exit;
    }

    // Validate batch existence and resolve batch_id / batch_name / coach_id
    $batch_id = null;
    if ($raw_batch_id > 0) {
        $bStmt = $pdo->prepare('
            SELECT b.batch_id, b.batch_name, b.coach_id, c.coach_name 
            FROM vsa_batches b
            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            WHERE b.batch_id = ?
        ');
        $bStmt->execute([$raw_batch_id]);
        $bRow = $bStmt->fetch(PDO::FETCH_ASSOC);
        if (!$bRow) {
            http_response_code(400);
            echo json_encode(['error' => 'Selected batch does not exist.']);
            exit;
        }
        $batch_id = intval($bRow['batch_id']);
        $batch_name = $bRow['batch_name'];
        if (!empty($bRow['coach_id'])) {
            $coach_id = intval($bRow['coach_id']);
            if (empty($coach_name)) {
                $coach_name = $bRow['coach_name'] ?? '';
            }
        }
    } else {
        $batch_id = null;
        if (empty($batch_name) || $batch_name === '0') {
            $batch_name = 'No Batch';
        }
    }

    if ($coach_id <= 0 && !empty($coach_name)) {
        $cStmt = $pdo->prepare('SELECT coach_id FROM vsa_coaches WHERE LOWER(TRIM(coach_name)) = LOWER(TRIM(?))');
        $cStmt->execute([$coach_name]);
        $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
        if ($cRow) {
            $coach_id = intval($cRow['coach_id']);
        }
    }

    if ($student_email && !filter_var($student_email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid email address format.']);
        exit;
    }

    try {
        if ($student_email) {
            $stmt = $pdo->prepare(
                'UPDATE vsa_students SET
                    student_name = ?, student_email = ?, school_name = ?, student_phone = ?, address = ?, date_of_birth = ?, status = ?,
                    parent_name = ?, gender = ?, blood_group = ?, branch_name = ?, coach_id = ?, coach_name = ?, batch_id = ?, batch_name = ?,
                    city = ?, postal_code = ?, father_contact_number = ?, mother_contact_number = ?,
                    emergency_contact_number = ?, whatsapp_number = ?
                 WHERE student_id = ?'
            );
            $stmt->execute([
                $student_name, $student_email, $school_name ?: null, $student_phone, $address, $date_of_birth ?: null, $status,
                $parent_name, $gender, $blood_group, $branch_name, ($coach_id > 0 ? $coach_id : null), $coach_name, ($batch_id > 0 ? $batch_id : null), $batch_name,
                $city, $postal_code, $father_contact_number, $mother_contact_number ?: null,
                $emergency_contact_number, $whatsapp_number,
                $student_id
            ]);
        } else {
            $stmt = $pdo->prepare(
                'UPDATE vsa_students SET
                    student_name = ?, school_name = ?, student_phone = ?, address = ?, date_of_birth = ?, status = ?,
                    parent_name = ?, gender = ?, blood_group = ?, branch_name = ?, coach_id = ?, coach_name = ?, batch_id = ?, batch_name = ?,
                    city = ?, postal_code = ?, father_contact_number = ?, mother_contact_number = ?,
                    emergency_contact_number = ?, whatsapp_number = ?
                 WHERE student_id = ?'
            );
            $stmt->execute([
                $student_name, $school_name ?: null, $student_phone, $address, $date_of_birth ?: null, $status,
                $parent_name, $gender, $blood_group, $branch_name, ($coach_id > 0 ? $coach_id : null), $coach_name, ($batch_id > 0 ? $batch_id : null), $batch_name,
                $city, $postal_code, $father_contact_number, $mother_contact_number ?: null,
                $emergency_contact_number, $whatsapp_number,
                $student_id
            ]);
        }

        if ($stmt->rowCount() === 0) {
            $check = $pdo->prepare('SELECT student_id FROM vsa_students WHERE student_id = ?');
            $check->execute([$student_id]);
            if (!$check->fetch()) {
                http_response_code(404);
                echo json_encode(['error' => 'Student not found.']);
                exit;
            }
        }

        $savedPhoto = null;
        if (!empty($input['remove_photo'])) {
            try {
                $stmtOld = $pdo->prepare('SELECT student_photo FROM vsa_students WHERE student_id = ?');
                $stmtOld->execute([$student_id]);
                $old = $stmtOld->fetch();
                if ($old && !empty($old['student_photo'])) {
                    $oldFile = __DIR__ . '/../' . $old['student_photo'];
                    if (file_exists($oldFile)) {
                        @unlink($oldFile);
                    }
                }
                $stmtClear = $pdo->prepare('UPDATE vsa_students SET student_photo = NULL WHERE student_id = ?');
                $stmtClear->execute([$student_id]);
            } catch (Exception $e) {}
        } else {
            $imageData = $input['image_data'] ?? $input['student_photo'] ?? '';
            if (!empty($imageData)) {
                $savedPhoto = saveOptimizedStudentPhoto($pdo, $student_id, $imageData);
            }
        }

        $batchInfo = $batch_name ?: 'No Batch';
        if ($batch_id > 0) {
            $batchInfo = "Batch #{$batch_id} ({$batch_name})";
        }
        $desc = "Updated student profile for {$student_name} (ID: #{$student_id}) — Assigned to {$batchInfo}";
        recordActivity($pdo, 'STUDENT', 'Updated', 'Student', $student_id, $student_name, $desc, [
            'student_id'   => $student_id,
            'student_name' => $student_name,
            'batch_id'     => $batch_id,
            'batch_name'   => $batch_name,
            'coach_name'   => $coach_name,
            'branch_name'  => $branch_name,
            'status'       => $status
        ], $input);

        echo json_encode(['success' => true, 'student_photo' => $savedPhoto]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update student: ' . $e->getMessage()]);
    }
    exit;
}

// ── DELETE: delete student by id (Super Admin Only) ────────────────────────
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $user = resolveUser($pdo, $input);

    if ($user['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: Only Super Admin can delete student records.']);
        exit;
    }

    $student_id = intval($input['student_id'] ?? 0);
    if (!$student_id) {
        http_response_code(400);
        echo json_encode(['error' => 'student_id is required.']);
        exit;
    }

    try {
        $stmtOld = $pdo->prepare('SELECT student_id, student_name, batch_name, student_photo FROM vsa_students WHERE student_id = ?');
        $stmtOld->execute([$student_id]);
        $student = $stmtOld->fetch();
        if (!$student) {
            http_response_code(404);
            echo json_encode(['error' => 'Student not found.']);
            exit;
        }

        if (!empty($student['student_photo'])) {
            $oldFile = __DIR__ . '/../' . $student['student_photo'];
            if (file_exists($oldFile)) {
                @unlink($oldFile);
            }
        }

        // Clean up role mapping in vsa_user_roles to prevent orphaned mappings
        $stmtRole = $pdo->prepare("DELETE FROM vsa_user_roles WHERE role = 'student' AND entity_id = ?");
        $stmtRole->execute([$student_id]);

        $stmt = $pdo->prepare('DELETE FROM vsa_students WHERE student_id = ?');
        $stmt->execute([$student_id]);

        $studentTitle = "Student #{$student_id} ({$student['student_name']})";
        recordActivity($pdo, 'STUDENT', 'Deleted', 'Student', $student_id, $studentTitle, "Deleted {$studentTitle}", $student, $input);

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        $errMsg = function_exists('formatSafeErrorMessage') ? formatSafeErrorMessage($e, 'Failed to delete student.') : $e->getMessage();
        echo json_encode(['error' => $errMsg]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
