<?php
/**
 * VAVA Sports Academy - Coaches API
 * Handles GET (fetch all or by ID), POST (create / upload photo / delete photo / assign batch), PUT (update), DELETE (delete coach)
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

// ── GET: fetch coaches ─────────────────────────────────────────────────────
if ($method === 'GET') {
    $id = intval($_GET['id'] ?? 0);
    try {
        if ($id > 0) {
            $stmt = $pdo->prepare('
                SELECT c.*, b.batch_name, b.sport AS batch_sport
                FROM vsa_coaches c
                LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
                WHERE c.coach_id = ?
            ');
            $stmt->execute([$id]);
            $coach = $stmt->fetch();
            if (!$coach) {
                http_response_code(404);
                echo json_encode(['error' => 'Coach not found.']);
                exit;
            }
            echo json_encode(['success' => true, 'coach' => $coach]);
        } else {
            $stmt = $pdo->query('
                SELECT c.*, b.batch_name, b.sport AS batch_sport
                FROM vsa_coaches c
                LEFT JOIN vsa_batches b ON c.batch_id = b.batch_id
                ORDER BY c.coach_id DESC
            ');
            $coaches = $stmt->fetchAll();
            echo json_encode(['success' => true, 'coaches' => $coaches]);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ── POST: register a coach OR handle photo / batch actions ────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';

    // Handle Upload Photo
    if ($action === 'upload_photo') {
        $coach_id = intval($input['coach_id'] ?? 0);
        $image_data = $input['image_data'] ?? '';

        if (!$coach_id || !$image_data) {
            http_response_code(400);
            echo json_encode(['error' => 'coach_id and image_data are required.']);
            exit;
        }

        $uploadDir = __DIR__ . '/../uploads/coaches/';
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

        $filename = 'coach_' . $coach_id . '_' . time() . '.' . $ext;
        $filepath = $uploadDir . $filename;
        $relativePath = 'uploads/coaches/' . $filename;

        try {
            $stmtOld = $pdo->prepare('SELECT coach_photo FROM vsa_coaches WHERE coach_id = ?');
            $stmtOld->execute([$coach_id]);
            $oldCoach = $stmtOld->fetch();
            if ($oldCoach && !empty($oldCoach['coach_photo'])) {
                $oldFile = __DIR__ . '/../' . $oldCoach['coach_photo'];
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
            $stmt = $pdo->prepare('UPDATE vsa_coaches SET coach_photo = ? WHERE coach_id = ?');
            $stmt->execute([$relativePath, $coach_id]);
            echo json_encode(['success' => true, 'coach_photo' => $relativePath]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update database: ' . $e->getMessage()]);
        }
        exit;
    }

    // Handle Delete Photo
    if ($action === 'delete_photo') {
        $coach_id = intval($input['coach_id'] ?? 0);
        if (!$coach_id) {
            http_response_code(400);
            echo json_encode(['error' => 'coach_id is required.']);
            exit;
        }

        try {
            $stmtOld = $pdo->prepare('SELECT coach_photo FROM vsa_coaches WHERE coach_id = ?');
            $stmtOld->execute([$coach_id]);
            $coach = $stmtOld->fetch();
            if ($coach && !empty($coach['coach_photo'])) {
                $oldFile = __DIR__ . '/../' . $coach['coach_photo'];
                if (file_exists($oldFile)) {
                    @unlink($oldFile);
                }
            }
            $stmt = $pdo->prepare('UPDATE vsa_coaches SET coach_photo = NULL WHERE coach_id = ?');
            $stmt->execute([$coach_id]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete photo: ' . $e->getMessage()]);
        }
        exit;
    }

    // Handle Regular Coach Registration
    $coach_name               = trim($input['coach_name']               ?? '');
    $coach_email              = trim($input['coach_email']              ?? '');
    $coach_phone              = trim($input['coach_phone']              ?? '');
    $coach_dob                = trim($input['coach_dob']                ?? '');
    $coach_joined_date        = trim($input['coach_joined_date']        ?? '');
    $coach_license            = trim($input['coach_license']            ?? '');
    $coach_address            = trim($input['coach_address']            ?? '');
    $coach_city               = trim($input['coach_city']               ?? '');
    $coach_postal_code        = trim($input['coach_postal_code']        ?? '');
    $emergency_contact_name   = trim($input['emergency_contact_name']   ?? '');
    $emergency_contact_number = trim($input['emergency_contact_number'] ?? '');
    $coach_sport              = trim($input['coach_sport']              ?? '');
    $status                   = trim($input['status']                   ?? 'Active');
    $batch_id                 = intval($input['batch_id']               ?? 0);

    if (!$coach_name || !$coach_email || !$coach_phone) {
        http_response_code(400);
        echo json_encode(['error' => 'Coach Name, Email, and Contact Number are required.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO vsa_coaches (
                coach_name, coach_email, coach_phone, coach_dob, coach_joined_date,
                coach_license, coach_address, coach_city, coach_postal_code,
                emergency_contact_name, emergency_contact_number, coach_sport, status, batch_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $coach_name, $coach_email, $coach_phone,
            $coach_dob ?: null, $coach_joined_date ?: null,
            $coach_license, $coach_address, $coach_city, $coach_postal_code,
            $emergency_contact_name, $emergency_contact_number, $coach_sport, $status,
            $batch_id > 0 ? $batch_id : null
        ]);
        $newId = $pdo->lastInsertId();

        echo json_encode([
            'success' => true,
            'coach_id' => $newId
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save coach: ' . $e->getMessage()]);
    }
    exit;
}

// ── PUT: update an existing coach ──────────────────────────────────────────
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);

    $coach_id                 = intval($input['coach_id']               ?? 0);
    $coach_name               = trim($input['coach_name']               ?? '');
    $coach_email              = trim($input['coach_email']              ?? '');
    $coach_phone              = trim($input['coach_phone']              ?? '');
    $coach_dob                = trim($input['coach_dob']                ?? '');
    $coach_joined_date        = trim($input['coach_joined_date']        ?? '');
    $coach_license            = trim($input['coach_license']            ?? '');
    $coach_address            = trim($input['coach_address']            ?? '');
    $coach_city               = trim($input['coach_city']               ?? '');
    $coach_postal_code        = trim($input['coach_postal_code']        ?? '');
    $emergency_contact_name   = trim($input['emergency_contact_name']   ?? '');
    $emergency_contact_number = trim($input['emergency_contact_number'] ?? '');
    $coach_sport              = trim($input['coach_sport']              ?? '');
    $status                   = trim($input['status']                   ?? 'Active');
    $batch_id                 = intval($input['batch_id']               ?? 0);

    if (!$coach_id || !$coach_name || !$coach_email || !$coach_phone) {
        http_response_code(400);
        echo json_encode(['error' => 'coach_id, Name, Email, and Phone are required.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            'UPDATE vsa_coaches SET
                coach_name = ?, coach_email = ?, coach_phone = ?, coach_dob = ?, coach_joined_date = ?,
                coach_license = ?, coach_address = ?, coach_city = ?, coach_postal_code = ?,
                emergency_contact_name = ?, emergency_contact_number = ?, coach_sport = ?, status = ?,
                batch_id = ?
             WHERE coach_id = ?'
        );
        $stmt->execute([
            $coach_name, $coach_email, $coach_phone,
            $coach_dob ?: null, $coach_joined_date ?: null,
            $coach_license, $coach_address, $coach_city, $coach_postal_code,
            $emergency_contact_name, $emergency_contact_number, $coach_sport, $status,
            $batch_id > 0 ? $batch_id : null,
            $coach_id
        ]);

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update coach: ' . $e->getMessage()]);
    }
    exit;
}

// ── DELETE: delete coach by id ─────────────────────────────────────────────
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $coach_id = intval($input['coach_id'] ?? 0);

    if (!$coach_id) {
        http_response_code(400);
        echo json_encode(['error' => 'coach_id is required.']);
        exit;
    }

    try {
        $stmtOld = $pdo->prepare('SELECT coach_photo FROM vsa_coaches WHERE coach_id = ?');
        $stmtOld->execute([$coach_id]);
        $coach = $stmtOld->fetch();
        if ($coach && !empty($coach['coach_photo'])) {
            $oldFile = __DIR__ . '/../' . $coach['coach_photo'];
            if (file_exists($oldFile)) {
                @unlink($oldFile);
            }
        }

        $stmt = $pdo->prepare('DELETE FROM vsa_coaches WHERE coach_id = ?');
        $stmt->execute([$coach_id]);

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Coach not found.']);
            exit;
        }

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete coach: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
