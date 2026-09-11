<?php
/**
 * VAVA Sports Academy - Attendance API
 * Handles GET & POST with role restriction (Coach-only) and assigned batch filtering.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];

/**
 * Helper function to authenticate role and resolve logged-in user info (Coach or Superadmin)
 */
function resolveAuthenticatedUser($pdo, $input = []) {
    $role = $_SERVER['HTTP_X_VAVA_ROLE'] ?? $_GET['role'] ?? $input['role'] ?? '';
    $email = $_SERVER['HTTP_X_VAVA_EMAIL'] ?? $_GET['email'] ?? $input['email'] ?? '';
    $coach_id = intval($_SERVER['HTTP_X_VAVA_COACH_ID'] ?? $_GET['coach_id'] ?? $input['coach_id'] ?? 0);

    $roleLower = strtolower(trim($role));

    // If role is explicitly student, deny access
    if ($roleLower === 'student') {
        http_response_code(403);
        echo json_encode(['error' => 'Access denied. The Attendance module is accessible to coaches and superadmin only.']);
        exit;
    }

    if ($roleLower === 'coach') {
        $coach = null;
        $query = '
            SELECT 
                c.coach_id,
                c.coach_name,
                c.coach_email,
                c.batch_id,
                COALESCE(NULLIF(c.batch_name, ""), b.batch_name, "Unassigned") AS batch_name
            FROM vsa_coaches c
            LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
        ';

        if ($coach_id > 0) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_id = ?');
            $stmt->execute([$coach_id]);
            $coach = $stmt->fetch();
        } elseif (!empty($email)) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_email = ?');
            $stmt->execute([$email]);
            $coach = $stmt->fetch();
        } else {
            // Default: Fallback to first active coach assigned to a batch
            $stmt = $pdo->query($query . ' WHERE c.batch_id IS NOT NULL ORDER BY c.coach_id ASC LIMIT 1');
            $coach = $stmt->fetch();
        }

        if (!$coach) {
            http_response_code(403);
            echo json_encode(['error' => 'Coach authorization failed or coach record not found.']);
            exit;
        }

        return ['role' => 'coach', 'coach' => $coach];
    }

    if ($roleLower === 'admin' || $roleLower === 'superadmin') {
        $admin = null;
        if (!empty($email)) {
            $stmt = $pdo->prepare('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE admin_email = ?');
            $stmt->execute([$email]);
            $admin = $stmt->fetch();
        } else {
            // Local dev fallback to first active superadmin
            $stmt = $pdo->query('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin ORDER BY admin_id ASC LIMIT 1');
            $admin = $stmt->fetch();
        }

        if (!$admin) {
            http_response_code(403);
            echo json_encode(['error' => 'Superadmin authorization failed. Admin record not found.']);
            exit;
        }

        return ['role' => 'superadmin', 'admin' => $admin];
    }

    // Default fallback: Check if coach_id passed -> coach, else deny
    if ($coach_id > 0) {
        $stmt = $pdo->prepare('
            SELECT c.coach_id, c.coach_name, c.coach_email, c.batch_id,
                   COALESCE(NULLIF(c.batch_name, ""), b.batch_name, "Unassigned") AS batch_name
            FROM vsa_coaches c LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
            WHERE c.coach_id = ?
        ');
        $stmt->execute([$coach_id]);
        $coach = $stmt->fetch();
        if ($coach) {
            return ['role' => 'coach', 'coach' => $coach];
        }
    }

    http_response_code(403);
    echo json_encode(['error' => 'Access denied. The Attendance module is accessible to coaches and superadmin only.']);
    exit;
}

// ── GET REQUESTS ─────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $auth = resolveAuthenticatedUser($pdo);
    $isSuperadmin = ($auth['role'] === 'superadmin');
    $coach = $auth['coach'] ?? null;
    $coach_batch_id = intval($coach['batch_id'] ?? 0);
    $action = $_GET['action'] ?? '';

    // Action: Fetch students for a specific batch & attendance date
    if ($action === 'get_students') {
        $batch_id = intval($_GET['batch_id'] ?? 0);
        $attendance_date = trim($_GET['attendance_date'] ?? '');

        if (!$batch_id || !$attendance_date) {
            http_response_code(400);
            echo json_encode(['error' => 'batch_id and attendance_date are required.']);
            exit;
        }

        // Access Control: Coach can only access their assigned batch
        if (!$isSuperadmin && $batch_id !== $coach_batch_id) {
            http_response_code(403);
            echo json_encode(['error' => 'Access denied. You can only view attendance for your assigned batch.']);
            exit;
        }

        try {
            $stmt = $pdo->prepare('
                SELECT 
                    s.student_id, 
                    s.student_name, 
                    COALESCE(a.status, "Absent") AS status
                FROM vsa_students s
                CROSS JOIN vsa_batches b ON b.batch_id = ?
                LEFT JOIN vsa_attendance a 
                    ON s.student_id = a.student_id 
                   AND a.batch_id = b.batch_id 
                   AND a.attendance_date = ?
                WHERE (s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
                ORDER BY s.student_name ASC
            ');
            $stmt->execute([$batch_id, $attendance_date]);
            $students = $stmt->fetchAll();

            echo json_encode([
                'success' => true,
                'is_superadmin' => $isSuperadmin,
                'read_only' => $isSuperadmin,
                'students' => $students
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Action: Fetch list of active batches for dropdown
    if ($action === 'get_batches') {
        try {
            if ($isSuperadmin) {
                $stmt = $pdo->query('SELECT batch_id, batch_name FROM vsa_batches ORDER BY batch_name ASC');
                $batches = $stmt->fetchAll();
            } else {
                $stmt = $pdo->prepare('SELECT batch_id, batch_name FROM vsa_batches WHERE batch_id = ?');
                $stmt->execute([$coach_batch_id]);
                $batches = $stmt->fetchAll();
            }
            echo json_encode(['success' => true, 'batches' => $batches]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Action: Fetch students with real attendance statistics
    if ($action === 'get_coach_students_attendance') {
        try {
            if ($isSuperadmin) {
                // Superadmin sees all students across all batches with batch and coach names
                $stmt = $pdo->prepare('
                    SELECT 
                        s.student_id,
                        s.student_name,
                        s.city,
                        s.student_photo,
                        COALESCE(NULLIF(s.student_phone, ""), NULLIF(s.father_contact_number, ""), s.emergency_contact_number, "") AS student_phone,
                        COALESCE(s.batch_id, b.batch_id, 0) AS batch_id,
                        COALESCE(NULLIF(s.batch_name, ""), b.batch_name, "Unassigned") AS batch_name,
                        COALESCE(NULLIF(s.coach_name, ""), c.coach_name, cb.coach_name, "Unassigned") AS coach_name,
                        COUNT(a.attendance_id) AS total_records,
                        SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count
                    FROM vsa_students s
                    LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
                    LEFT JOIN vsa_coaches c ON s.coach_id = c.coach_id
                    LEFT JOIN vsa_coaches cb ON b.batch_id = cb.batch_id
                    LEFT JOIN vsa_attendance a ON s.student_id = a.student_id
                    GROUP BY s.student_id, s.student_name, s.city, s.student_photo, student_phone, batch_id, batch_name, coach_name
                    ORDER BY s.student_name ASC
                ');
                $stmt->execute();
            } else {
                // Coach sees students in assigned batch
                $stmt = $pdo->prepare('
                    SELECT 
                        s.student_id,
                        s.student_name,
                        s.city,
                        s.student_photo,
                        COALESCE(NULLIF(s.student_phone, ""), NULLIF(s.father_contact_number, ""), s.emergency_contact_number, "") AS student_phone,
                        b.batch_id,
                        COALESCE(NULLIF(s.batch_name, ""), b.batch_name, "Unassigned") AS batch_name,
                        COUNT(a.attendance_id) AS total_records,
                        SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count
                    FROM vsa_students s
                    CROSS JOIN vsa_batches b ON b.batch_id = ?
                    LEFT JOIN vsa_attendance a ON s.student_id = a.student_id AND a.batch_id = b.batch_id
                    WHERE (s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
                    GROUP BY s.student_id, s.student_name, s.city, s.student_photo, student_phone, b.batch_id, s.batch_name, b.batch_name
                    ORDER BY s.student_name ASC
                ');
                $stmt->execute([$coach_batch_id]);
            }
            $students = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Format counts as integers for safety and calculate percentage
            $formatted = array_map(function($st) {
                $st['total_records'] = intval($st['total_records'] ?? 0);
                $st['present_count'] = intval($st['present_count'] ?? 0);
                $st['percentage'] = $st['total_records'] > 0 
                    ? round(($st['present_count'] / $st['total_records']) * 100) 
                    : 0;
                return $st;
            }, $students);

            $response = [
                'success' => true,
                'is_superadmin' => $isSuperadmin,
                'students' => $formatted
            ];

            if (!$isSuperadmin && $coach) {
                $response['coach_info'] = [
                    'coach_id' => intval($coach['coach_id']),
                    'coach_name' => $coach['coach_name'],
                    'batch_id' => intval($coach['batch_id']),
                    'batch_name' => $coach['batch_name']
                ];
            }

            echo json_encode($response);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Action: Fetch full attendance history for a single student
    if ($action === 'get_student_attendance_history') {
        $student_id = intval($_GET['student_id'] ?? 0);
        if (!$student_id) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id is required.']);
            exit;
        }

        try {
            if ($isSuperadmin) {
                $checkStmt = $pdo->prepare('
                    SELECT 
                        s.student_id, 
                        s.student_name, 
                        s.city, 
                        s.student_photo,
                        COALESCE(NULLIF(s.student_phone, ""), NULLIF(s.father_contact_number, ""), s.emergency_contact_number, "") AS student_phone,
                        COALESCE(NULLIF(s.batch_name, ""), b.batch_name, "Unassigned") AS batch_name,
                        COALESCE(NULLIF(s.coach_name, ""), c.coach_name, cb.coach_name, "Unassigned") AS coach_name
                    FROM vsa_students s
                    LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
                    LEFT JOIN vsa_coaches c ON s.coach_id = c.coach_id
                    LEFT JOIN vsa_coaches cb ON b.batch_id = cb.batch_id
                    WHERE s.student_id = ?
                    LIMIT 1
                ');
                $checkStmt->execute([$student_id]);
                $student = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if (!$student) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Student not found.']);
                    exit;
                }

                $histStmt = $pdo->prepare('
                    SELECT 
                        attendance_date, 
                        status 
                    FROM vsa_attendance 
                    WHERE student_id = ? 
                    ORDER BY attendance_date DESC
                ');
                $histStmt->execute([$student_id]);
                $history = $histStmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                // Verify student belongs to coach\'s batch
                $checkStmt = $pdo->prepare('
                    SELECT 
                        s.student_id, 
                        s.student_name, 
                        s.city, 
                        s.student_photo,
                        COALESCE(NULLIF(s.student_phone, ""), NULLIF(s.father_contact_number, ""), s.emergency_contact_number, "") AS student_phone,
                        COALESCE(NULLIF(s.batch_name, ""), b.batch_name, "Unassigned") AS batch_name
                    FROM vsa_students s
                    CROSS JOIN vsa_batches b ON b.batch_id = ?
                    WHERE s.student_id = ? AND (s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
                    LIMIT 1
                ');
                $checkStmt->execute([$coach_batch_id, $student_id]);
                $student = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if (!$student) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Access denied or student not found in your assigned batch.']);
                    exit;
                }

                // Fetch records sorted Latest -> Oldest
                $histStmt = $pdo->prepare('
                    SELECT 
                        attendance_date, 
                        status 
                    FROM vsa_attendance 
                    WHERE student_id = ? AND batch_id = ? 
                    ORDER BY attendance_date DESC
                ');
                $histStmt->execute([$student_id, $coach_batch_id]);
                $history = $histStmt->fetchAll(PDO::FETCH_ASSOC);
            }

            $presentCount = 0;
            $totalCount = count($history);
            foreach ($history as $h) {
                if ($h['status'] === 'Present') {
                    $presentCount++;
                }
            }
            $percentage = $totalCount > 0 ? round(($presentCount / $totalCount) * 100) : 0;

            echo json_encode([
                'success' => true,
                'student' => $student,
                'stats' => [
                    'present_count' => $presentCount,
                    'total_records' => $totalCount,
                    'percentage' => $percentage
                ],
                'history' => $history
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Default GET: Fetch Attendance sheets
    try {
        if ($isSuperadmin) {
            // Superadmin sees attendance sheets from ALL batches
            $stmt = $pdo->query('
                SELECT 
                    a.batch_id,
                    a.attendance_date,
                    b.batch_name,
                    COALESCE(c.coach_name, cb.coach_name, "Unassigned") AS coach_name,
                    a.coach_id,
                    (
                        SELECT COUNT(*) 
                        FROM vsa_students s 
                        WHERE s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))
                    ) AS total_batch_students,
                    COUNT(a.attendance_id) AS sheet_records_count,
                    SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count
                FROM vsa_attendance a
                INNER JOIN vsa_batches b ON a.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON a.coach_id = c.coach_id
                LEFT JOIN vsa_coaches cb ON b.batch_id = cb.batch_id
                GROUP BY a.batch_id, a.attendance_date, b.batch_name, coach_name, a.coach_id
                ORDER BY a.attendance_date DESC, b.batch_name ASC
            ');
            $sheets = $stmt->fetchAll();

            echo json_encode([
                'success' => true,
                'is_superadmin' => true,
                'sheets' => $sheets
            ]);
        } else {
            // Coach sees sheets ONLY for assigned batch_id
            $stmt = $pdo->prepare('
                SELECT 
                    a.batch_id,
                    a.attendance_date,
                    b.batch_name,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name,
                    a.coach_id,
                    (
                        SELECT COUNT(*) 
                        FROM vsa_students s 
                        WHERE s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))
                    ) AS total_batch_students,
                    COUNT(a.attendance_id) AS sheet_records_count,
                    SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count
                FROM vsa_attendance a
                INNER JOIN vsa_batches b ON a.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON a.coach_id = c.coach_id
                WHERE a.batch_id = ?
                GROUP BY a.batch_id, a.attendance_date, b.batch_name, coach_name, a.coach_id
                ORDER BY a.attendance_date DESC, b.batch_name ASC
            ');
            $stmt->execute([$coach_batch_id]);
            $sheets = $stmt->fetchAll();

            echo json_encode([
                'success' => true,
                'is_superadmin' => false,
                'coach_info' => [
                    'coach_id' => intval($coach['coach_id']),
                    'coach_name' => $coach['coach_name'],
                    'batch_id' => intval($coach['batch_id']),
                    'batch_name' => $coach['batch_name']
                ],
                'sheets' => $sheets
            ]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ── POST REQUESTS ────────────────────────────────────────────────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $auth = resolveAuthenticatedUser($pdo, $input);
    $isSuperadmin = ($auth['role'] === 'superadmin');
    $coach = $auth['coach'] ?? null;
    $coach_batch_id = intval($coach['batch_id'] ?? 0);
    $coach_id = intval($coach['coach_id'] ?? 0);
    $action = $input['action'] ?? '';

    // Action: Create a new attendance sheet
    if ($action === 'create_sheet') {
        if ($isSuperadmin) {
            http_response_code(403);
            echo json_encode(['error' => 'Permission denied. Superadmin has read-only access for creating attendance sheets.']);
            exit;
        }

        // Automatically enforce coach\'s assigned batch_id
        $batch_id = $coach_batch_id;
        $attendance_date = trim($input['attendance_date'] ?? '');

        if (!$batch_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Coach has no assigned batch.']);
            exit;
        }

        if (!$attendance_date) {
            http_response_code(400);
            echo json_encode(['error' => 'Please select an attendance date.']);
            exit;
        }

        try {
            // Check if attendance already exists for this batch + date
            $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM vsa_attendance WHERE batch_id = ? AND attendance_date = ?');
            $checkStmt->execute([$batch_id, $attendance_date]);
            if ($checkStmt->fetchColumn() > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Attendance for your assigned batch and date already exists.']);
                exit;
            }

            // Fetch students belonging to the assigned batch
            $studStmt = $pdo->prepare('
                SELECT s.student_id 
                FROM vsa_students s
                CROSS JOIN vsa_batches b ON b.batch_id = ?
                WHERE (s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
            ');
            $studStmt->execute([$batch_id]);
            $students = $studStmt->fetchAll();

            if (empty($students)) {
                http_response_code(400);
                echo json_encode(['error' => 'No students found in your assigned batch. Please add students to the batch first.']);
                exit;
            }

            // Insert initial default attendance records (status: Absent)
            $insertStmt = $pdo->prepare('
                INSERT INTO vsa_attendance (batch_id, coach_id, student_id, attendance_date, status)
                VALUES (?, ?, ?, ?, ?)
            ');

            foreach ($students as $student) {
                $insertStmt->execute([$batch_id, $coach_id, $student['student_id'], $attendance_date, 'Absent']);
            }

            echo json_encode([
                'success' => true,
                'message' => 'Attendance sheet created successfully.',
                'batch_id' => $batch_id,
                'batch_name' => $coach['batch_name'] ?? '',
                'coach_name' => $coach['coach_name'] ?? '',
                'attendance_date' => $attendance_date
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Action: Save / Update attendance for students in an open sheet
    if ($action === 'save_attendance') {
        if ($isSuperadmin) {
            http_response_code(403);
            echo json_encode(['error' => 'Permission denied. Superadmin has read-only access for marking attendance.']);
            exit;
        }

        $batch_id = intval($input['batch_id'] ?? 0);
        if (!$batch_id) {
            $batch_id = $coach_batch_id;
        }
        $attendance_date = trim($input['attendance_date'] ?? '');
        $records = $input['records'] ?? [];

        if ($batch_id !== $coach_batch_id) {
            http_response_code(403);
            echo json_encode(['error' => 'Access denied. You can only save attendance for your assigned batch.']);
            exit;
        }

        if (!$batch_id || !$attendance_date || !is_array($records)) {
            http_response_code(400);
            echo json_encode(['error' => 'batch_id, attendance_date, and records array are required.']);
            exit;
        }

        try {
            $upsertStmt = $pdo->prepare('
                INSERT INTO vsa_attendance (batch_id, coach_id, student_id, attendance_date, status)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    status = VALUES(status), 
                    coach_id = VALUES(coach_id)
            ');

            foreach ($records as $rec) {
                $student_id = intval($rec['student_id'] ?? 0);
                $status = ($rec['status'] === 'Present') ? 'Present' : 'Absent';
                if ($student_id > 0) {
                    $upsertStmt->execute([$batch_id, $coach_id, $student_id, $attendance_date, $status]);
                }
            }

            echo json_encode([
                'success' => true,
                'message' => 'Attendance records saved successfully.'
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    // Action: Delete an entire attendance sheet
    if ($action === 'delete_sheet') {
        $batch_id = intval($input['batch_id'] ?? 0);
        if (!$batch_id && !$isSuperadmin) {
            $batch_id = $coach_batch_id;
        }
        $attendance_date = trim($input['attendance_date'] ?? '');

        if (!$isSuperadmin && $batch_id !== $coach_batch_id) {
            http_response_code(403);
            echo json_encode(['error' => 'Access denied. You can only delete attendance for your assigned batch.']);
            exit;
        }

        if (!$batch_id || !$attendance_date) {
            http_response_code(400);
            echo json_encode(['error' => 'batch_id and attendance_date are required.']);
            exit;
        }

        try {
            $delStmt = $pdo->prepare('DELETE FROM vsa_attendance WHERE batch_id = ? AND attendance_date = ?');
            $delStmt->execute([$batch_id, $attendance_date]);

            echo json_encode([
                'success' => true,
                'message' => 'Attendance sheet deleted successfully.'
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
        }
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Invalid action.']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
?>
