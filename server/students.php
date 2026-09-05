<?php
/**
 * VAVA Sports Academy - Students API
 * Handles GET (fetch all), POST (create), PUT (update), DELETE (delete by student_id)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];

// ── GET: fetch all students or single student by ID ───────────────────────
if ($method === 'GET') {
    $id = intval($_GET['id'] ?? 0);
    try {
        if ($id > 0) {
            $stmt = $pdo->prepare('SELECT * FROM students WHERE student_id = ?');
            $stmt->execute([$id]);
            $student = $stmt->fetch();
            if (!$student) {
                http_response_code(404);
                echo json_encode(['error' => 'Student not found.']);
                exit;
            }
            echo json_encode(['success' => true, 'student' => $student]);
        } else {
            $stmt = $pdo->query('SELECT * FROM students ORDER BY student_id DESC');
            $students = $stmt->fetchAll();
            echo json_encode(['success' => true, 'students' => $students]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ── POST: register a new student OR handle photo actions ───────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';

    // Handle Upload Photo
    if ($action === 'upload_photo') {
        $student_id = intval($input['student_id'] ?? 0);
        $image_data = $input['image_data'] ?? '';

        if (!$student_id || !$image_data) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id and image_data are required.']);
            exit;
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
            $stmtOld = $pdo->prepare('SELECT student_photo FROM students WHERE student_id = ?');
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
            $stmt = $pdo->prepare('UPDATE students SET student_photo = ? WHERE student_id = ?');
            $stmt->execute([$relativePath, $student_id]);
            echo json_encode(['success' => true, 'student_photo' => $relativePath]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update database: ' . $e->getMessage()]);
        }
        exit;
    }

    // Handle Delete Photo
    if ($action === 'delete_photo') {
        $student_id = intval($input['student_id'] ?? 0);
        if (!$student_id) {
            http_response_code(400);
            echo json_encode(['error' => 'student_id is required.']);
            exit;
        }

        try {
            $stmtOld = $pdo->prepare('SELECT student_photo FROM students WHERE student_id = ?');
            $stmtOld->execute([$student_id]);
            $student = $stmtOld->fetch();
            if ($student && !empty($student['student_photo'])) {
                $oldFile = __DIR__ . '/../' . $student['student_photo'];
                if (file_exists($oldFile)) {
                    @unlink($oldFile);
                }
            }
            $stmt = $pdo->prepare('UPDATE students SET student_photo = NULL WHERE student_id = ?');
            $stmt->execute([$student_id]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete photo: ' . $e->getMessage()]);
        }
        exit;
    }

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
    $student_phone            = trim($input['student_phone']            ?? $father_contact_number);
    $joined_date              = trim($input['joined_date']              ?? date('Y-m-d'));
    $status                   = trim($input['status']                   ?? 'Active');

    if (!$student_name || !$parent_name || !$branch_name || !$city || !$father_contact_number) {
        http_response_code(400);
        echo json_encode(['error' => 'All required fields must be filled.']);
        exit;
    }

    // Auto-generate email if empty to satisfy UNIQUE constraint
    if (!$student_email) {
        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $student_name));
        $student_email = $slug . '_' . time() . rand(10, 99) . '@vavasports.local';
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO students (
                student_name, student_email, student_phone, address, date_of_birth, joined_date, status,
                parent_name, gender, blood_group, branch_name, coach_name, batch_name, city, postal_code,
                father_contact_number, mother_contact_number, emergency_contact_number, whatsapp_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $student_name, $student_email, $student_phone, $address, $date_of_birth ?: null, $joined_date, $status,
            $parent_name, $gender, $blood_group, $branch_name, $coach_name, $batch_name, $city, $postal_code,
            $father_contact_number, $mother_contact_number ?: null, $emergency_contact_number, $whatsapp_number
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
    $input = json_decode(file_get_contents('php://input'), true);

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
    $student_phone            = trim($input['student_phone']            ?? $father_contact_number);
    $status                   = trim($input['status']                   ?? 'Active');

    if (!$student_id || !$student_name || !$parent_name || !$branch_name || !$city || !$father_contact_number) {
        http_response_code(400);
        echo json_encode(['error' => 'student_id and required fields are required.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            'UPDATE students SET
                student_name = ?, student_phone = ?, address = ?, date_of_birth = ?, status = ?,
                parent_name = ?, gender = ?, blood_group = ?, branch_name = ?, coach_name = ?, batch_name = ?,
                city = ?, postal_code = ?, father_contact_number = ?, mother_contact_number = ?,
                emergency_contact_number = ?, whatsapp_number = ?
             WHERE student_id = ?'
        );
        $stmt->execute([
            $student_name, $student_phone, $address, $date_of_birth ?: null, $status,
            $parent_name, $gender, $blood_group, $branch_name, $coach_name, $batch_name,
            $city, $postal_code, $father_contact_number, $mother_contact_number ?: null,
            $emergency_contact_number, $whatsapp_number,
            $student_id
        ]);

        if ($stmt->rowCount() === 0) {
            $check = $pdo->prepare('SELECT student_id FROM students WHERE student_id = ?');
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

// ── DELETE: delete student by id ───────────────────────────────────────────
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $student_id = intval($input['student_id'] ?? 0);

    if (!$student_id) {
        http_response_code(400);
        echo json_encode(['error' => 'student_id is required.']);
        exit;
    }

    try {
        $stmtOld = $pdo->prepare('SELECT student_photo FROM students WHERE student_id = ?');
        $stmtOld->execute([$student_id]);
        $student = $stmtOld->fetch();
        if ($student && !empty($student['student_photo'])) {
            $oldFile = __DIR__ . '/../' . $student['student_photo'];
            if (file_exists($oldFile)) {
                @unlink($oldFile);
            }
        }

        $stmt = $pdo->prepare('DELETE FROM students WHERE student_id = ?');
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
