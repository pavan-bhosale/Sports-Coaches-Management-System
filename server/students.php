<?php
/**
 * VAVA Sports Academy - Students API
 * Handles GET (fetch all / single / note), POST (create / photo / save_note / delete_note), PUT (update), DELETE (delete student)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';

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
 * Resolve authenticated user and coach details from request headers/parameters
 */
function resolveUser($pdo, $input = []) {
    $role = $_SERVER['HTTP_X_VAVA_ROLE'] ?? $_GET['role'] ?? $input['role'] ?? '';
    $email = $_SERVER['HTTP_X_VAVA_EMAIL'] ?? $_GET['email'] ?? $input['email'] ?? '';
    $coach_id = intval($_SERVER['HTTP_X_VAVA_COACH_ID'] ?? $_GET['coach_id'] ?? $input['coach_id'] ?? 0);

    $roleLower = strtolower(trim($role));

    if ($roleLower === 'student') {
        return ['role' => 'student', 'email' => $email];
    }

    if ($roleLower === 'coach') {
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

        if ($coach_id > 0 && !empty($email)) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_id = ? AND c.coach_email = ?');
            $stmt->execute([$coach_id, $email]);
            $coach = $stmt->fetch();
        }
        if (!$coach && $coach_id > 0) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_id = ?');
            $stmt->execute([$coach_id]);
            $coach = $stmt->fetch();
        }
        if (!$coach && !empty($email)) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_email = ?');
            $stmt->execute([$email]);
            $coach = $stmt->fetch();
        }

        if (!$coach) {
            http_response_code(403);
            echo json_encode(['error' => 'Coach authorization failed or coach record not found.']);
            exit;
        }

        return ['role' => 'coach', 'coach' => $coach];
    }

    // Default: admin / superadmin
    return ['role' => 'admin'];
}

/**
 * Check if a student record belongs to the coach\'s assigned batch
 */
function isStudentInCoachBatch($student, $coach) {
    if (!$student || !$coach) return false;
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
    return false;
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET: fetch all students, single student by ID, or student note ──────────
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $id = intval($_GET['id'] ?? 0);
    $user = resolveUser($pdo);

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
            if (!isStudentInCoachBatch($student, $user['coach'])) {
                http_response_code(403);
                echo json_encode(['error' => 'Unauthorized: You can only view notes for students in your assigned batch.']);
                exit;
            }
        } elseif ($user['role'] === 'student') {
            http_response_code(403);
            echo json_encode(['error' => 'Students are not authorized to view notes.']);
            exit;
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
                if (!isStudentInCoachBatch($student, $user['coach'])) {
                    http_response_code(403);
                    echo json_encode(['error' => 'Unauthorized: This student does not belong to your assigned batch.']);
                    exit;
                }
            }

            echo json_encode(['success' => true, 'student' => $student]);
        } else {
            // Fetch all students (coach batch-restricted vs superadmin all)
            if ($user['role'] === 'coach') {
                $assignedBatchId = intval($user['coach']['batch_id'] ?? 0);
                $assignedBatchName = trim($user['coach']['batch_name'] ?? '');

                if ($assignedBatchId <= 0 && empty($assignedBatchName)) {
                    echo json_encode(['success' => true, 'students' => []]);
                    exit;
                }

                $stmt = $pdo->prepare('
                    SELECT * FROM vsa_students
                    WHERE (? > 0 AND batch_id = ?)
                       OR (batch_name IS NOT NULL AND LOWER(TRIM(batch_name)) = LOWER(TRIM(?)))
                    ORDER BY student_id DESC
                ');
                $stmt->execute([$assignedBatchId, $assignedBatchId, $assignedBatchName]);
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
        $image_data = $input['image_data'] ?? '';

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

        $image_data = base64_decode($image_data);
        if ($image_data === false) {
            http_response_code(400);
            echo json_encode(['error' => 'Base64 image decoding failed.']);
            exit;
        }

        $filename = 'student_' . $student_id . '_' . time() . '.' . $ext;
        $filepath = $uploadDir . $filename;
        $relativePath = 'uploads/students/' . $filename;

        try {
            $stmtOld = $pdo->prepare('SELECT student_photo FROM vsa_students WHERE student_id = ?');
            $stmtOld->execute([$student_id]);
            $oldStudent = $stmtOld->fetch();
            if ($oldStudent && !empty($oldStudent['student_photo'])) {
                $oldFile = __DIR__ . '/../' . $oldStudent['student_photo'];
                if (file_exists($oldFile)) {
                    @unlink($oldFile);
                }
            }
        } catch (Exception $e) {}

        if (file_put_contents($filepath, $image_data) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save image file on server.']);
            exit;
        }

        try {
            $stmt = $pdo->prepare('UPDATE vsa_students SET student_photo = ? WHERE student_id = ?');
            $stmt->execute([$relativePath, $student_id]);
            echo json_encode(['success' => true, 'student_photo' => $relativePath]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update database: ' . $e->getMessage()]);
        }
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

    // ── 5. Student Registration
    $student_name             = trim($input['student_name']             ?? '');
    $parent_name              = trim($input['parent_name']              ?? '');
    $date_of_birth            = trim($input['date_of_birth']            ?? '');
    $gender                   = trim($input['gender']                   ?? '');
    $blood_group              = trim($input['blood_group']              ?? '');
    $branch_name              = trim($input['branch_name']              ?? '');
    $coach_name               = trim($input['coach_name']               ?? '');
    $batch_name               = trim($input['batch_name']               ?? '');
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

    // Auto-generate email if empty to satisfy UNIQUE constraint
    if (!$student_email) {
        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $student_name));
        $student_email = $slug . '_' . time() . rand(10, 99) . '@vavasports.local';
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO vsa_students (
                student_name, student_email, school_name, student_phone, address, date_of_birth, joined_date, status,
                parent_name, gender, blood_group, branch_name, coach_name, batch_name, city, postal_code,
                father_contact_number, mother_contact_number, emergency_contact_number, whatsapp_number, student_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $student_name, $student_email, $school_name ?: null, $student_phone, $address, $date_of_birth ?: null, $joined_date, $status,
            $parent_name, $gender, $blood_group, $branch_name, $coach_name, $batch_name, $city, $postal_code,
            $father_contact_number, $mother_contact_number ?: null, $emergency_contact_number, $whatsapp_number,
            $student_note ?: null
        ]);
        $newId = $pdo->lastInsertId();

        echo json_encode([
            'success' => true,
            'student_id' => $newId
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save student: ' . $e->getMessage()]);
    }
    exit;
}

// ── PUT: update an existing student ────────────────────────────────────────
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $user = resolveUser($pdo, $input);

    $student_id               = intval($input['student_id']             ?? 0);
    $student_name             = trim($input['student_name']             ?? '');
    $parent_name              = trim($input['parent_name']              ?? '');
    $date_of_birth            = trim($input['date_of_birth']            ?? '');
    $gender                   = trim($input['gender']                   ?? '');
    $blood_group              = trim($input['blood_group']              ?? '');
    $branch_name              = trim($input['branch_name']              ?? '');
    $coach_name               = trim($input['coach_name']               ?? '');
    $batch_name               = trim($input['batch_name']               ?? '');
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
                    parent_name = ?, gender = ?, blood_group = ?, branch_name = ?, coach_name = ?, batch_name = ?,
                    city = ?, postal_code = ?, father_contact_number = ?, mother_contact_number = ?,
                    emergency_contact_number = ?, whatsapp_number = ?
                 WHERE student_id = ?'
            );
            $stmt->execute([
                $student_name, $student_email, $school_name ?: null, $student_phone, $address, $date_of_birth ?: null, $status,
                $parent_name, $gender, $blood_group, $branch_name, $coach_name, $batch_name,
                $city, $postal_code, $father_contact_number, $mother_contact_number ?: null,
                $emergency_contact_number, $whatsapp_number,
                $student_id
            ]);
        } else {
            $stmt = $pdo->prepare(
                'UPDATE vsa_students SET
                    student_name = ?, school_name = ?, student_phone = ?, address = ?, date_of_birth = ?, status = ?,
                    parent_name = ?, gender = ?, blood_group = ?, branch_name = ?, coach_name = ?, batch_name = ?,
                    city = ?, postal_code = ?, father_contact_number = ?, mother_contact_number = ?,
                    emergency_contact_number = ?, whatsapp_number = ?
                 WHERE student_id = ?'
            );
            $stmt->execute([
                $student_name, $school_name ?: null, $student_phone, $address, $date_of_birth ?: null, $status,
                $parent_name, $gender, $blood_group, $branch_name, $coach_name, $batch_name,
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

        echo json_encode(['success' => true]);
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

    if ($user['role'] === 'coach') {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: Coaches cannot delete student records.']);
        exit;
    }

    $student_id = intval($input['student_id'] ?? 0);
    if (!$student_id) {
        http_response_code(400);
        echo json_encode(['error' => 'student_id is required.']);
        exit;
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

        $stmt = $pdo->prepare('DELETE FROM vsa_students WHERE student_id = ?');
        $stmt->execute([$student_id]);

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Student not found.']);
            exit;
        }

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete student: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
