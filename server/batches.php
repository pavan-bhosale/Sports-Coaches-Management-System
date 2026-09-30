<?php
/**
 * VAVA Sports Academy - Batches API
 * Handles GET (fetch all with dynamic student count and coach assignment),
 * POST (create batch with optional coach),
 * PUT (update batch with optional coach),
 * DELETE (delete batch by id)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID, X-VAVA-Actor-Name');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';
require_once 'activity_logger.php';

$method = $_SERVER['REQUEST_METHOD'];

// ── GET: fetch all batches ─────────────────────────────────────────────────
if ($method === 'GET') {
    try {
        $stmt = $pdo->query('
            SELECT 
                b.batch_id, 
                b.batch_name, 
                b.batch_location, 
                b.batch_time, 
                COALESCE(b.sport, "Football") AS sport,
                b.coach_id,
                c.coach_name,
                COUNT(DISTINCT s.student_id) AS student_count,
                COUNT(DISTINCT s.student_id) AS current_students,
                COUNT(DISTINCT s.student_id) AS max_students,
                b.status,
                b.created_at 
            FROM vsa_batches b
            LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            LEFT JOIN vsa_students s ON (s.batch_id = b.batch_id OR (s.batch_id IS NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))))
            GROUP BY b.batch_id
            ORDER BY b.created_at DESC
        ');
        $batches = $stmt->fetchAll();
        echo json_encode(['success' => true, 'batches' => $batches]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ── POST: create a new batch ───────────────────────────────────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $batch_name     = trim($input['batch_name']     ?? '');
    $batch_location = trim($input['batch_location'] ?? '');
    $batch_time     = trim($input['batch_time']     ?? '');
    $sport          = trim($input['sport']          ?? 'Football');
    if (!$sport) $sport = 'Football';
    $coach_id       = intval($input['coach_id']     ?? 0);

    if (!$batch_name || !$batch_location || !$batch_time) {
        http_response_code(400);
        echo json_encode(['error' => 'Batch Name, Location, and Time are required.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO vsa_batches (batch_name, batch_location, batch_time, sport, coach_id) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $batch_name, 
            $batch_location, 
            $batch_time, 
            $sport, 
            $coach_id > 0 ? $coach_id : null
        ]);
        $newId = $pdo->lastInsertId();

        $coachName = null;
        if ($coach_id > 0) {
            $cStmt = $pdo->prepare('SELECT coach_name FROM vsa_coaches WHERE coach_id = ?');
            $cStmt->execute([$coach_id]);
            $cRow = $cStmt->fetch();
            if ($cRow) $coachName = $cRow['coach_name'];
        }

        $desc = "Created Batch #{$newId} ({$batch_name}) at {$batch_location}";
        if ($coachName) {
            $desc .= " assigned to Coach {$coachName}";
        }
        recordActivity($pdo, 'BATCH', 'Created', 'Batch', $newId, "Batch #{$newId} ({$batch_name})", $desc, [
            'batch_id'       => $newId,
            'batch_name'     => $batch_name,
            'batch_location' => $batch_location,
            'batch_time'     => $batch_time,
            'coach_id'       => $coach_id > 0 ? $coach_id : null,
            'coach_name'     => $coachName
        ], $input);

        echo json_encode([
            'success' => true,
            'batch' => [
                'batch_id'       => $newId,
                'batch_name'     => $batch_name,
                'batch_location' => $batch_location,
                'batch_time'     => $batch_time,
                'sport'          => $sport,
                'coach_id'       => $coach_id > 0 ? $coach_id : null,
                'coach_name'     => $coachName,
                'student_count'  => 0,
                'current_students' => 0
            ]
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create batch: ' . $e->getMessage()]);
    }
    exit;
}

// ── PUT: update an existing batch ──────────────────────────────────────────
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);

    $batch_id       = intval($input['batch_id']     ?? 0);
    $batch_name     = trim($input['batch_name']     ?? '');
    $batch_location = trim($input['batch_location'] ?? '');
    $batch_time     = trim($input['batch_time']     ?? '');
    $coach_id       = isset($input['coach_id']) && $input['coach_id'] !== '' ? intval($input['coach_id']) : 0;

    if (!$batch_id || !$batch_name || !$batch_location || !$batch_time) {
        http_response_code(400);
        echo json_encode(['error' => 'Batch ID, Name, Location, and Time are required.']);
        exit;
    }

    try {
        $check = $pdo->prepare('SELECT batch_id FROM vsa_batches WHERE batch_id = ?');
        $check->execute([$batch_id]);
        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Batch not found.']);
            exit;
        }

        $stmt = $pdo->prepare(
            'UPDATE vsa_batches SET batch_name = ?, batch_location = ?, batch_time = ?, coach_id = ? WHERE batch_id = ?'
        );
        $stmt->execute([
            $batch_name, 
            $batch_location, 
            $batch_time, 
            $coach_id > 0 ? $coach_id : null, 
            $batch_id
        ]);

        $coachName = null;
        if ($coach_id > 0) {
            $cStmt = $pdo->prepare('SELECT coach_name FROM vsa_coaches WHERE coach_id = ?');
            $cStmt->execute([$coach_id]);
            $cRow = $cStmt->fetch();
            if ($cRow) $coachName = $cRow['coach_name'];
        }

        $desc = "Updated Batch #{$batch_id} ({$batch_name})";
        if ($coachName) {
            $desc .= " (Coach: {$coachName})";
        }
        recordActivity($pdo, 'BATCH', 'Updated', 'Batch', $batch_id, "Batch #{$batch_id} ({$batch_name})", $desc, [
            'batch_id'       => $batch_id,
            'batch_name'     => $batch_name,
            'batch_location' => $batch_location,
            'batch_time'     => $batch_time,
            'coach_id'       => $coach_id > 0 ? $coach_id : null,
            'coach_name'     => $coachName
        ], $input);

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update batch: ' . $e->getMessage()]);
    }
    exit;
}

// ── DELETE: delete batch by id ─────────────────────────────────────────────
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $batch_id = intval($input['batch_id'] ?? 0);

    if (!$batch_id) {
        http_response_code(400);
        echo json_encode(['error' => 'batch_id is required.']);
        exit;
    }

    try {
        $bStmt = $pdo->prepare('SELECT batch_id, batch_name, batch_location FROM vsa_batches WHERE batch_id = ?');
        $bStmt->execute([$batch_id]);
        $batchRow = $bStmt->fetch();
        if (!$batchRow) {
            http_response_code(404);
            echo json_encode(['error' => 'Batch not found.']);
            exit;
        }

        $stmt = $pdo->prepare('DELETE FROM vsa_batches WHERE batch_id = ?');
        $stmt->execute([$batch_id]);

        $batchTitle = "Batch #{$batch_id} ({$batchRow['batch_name']})";
        recordActivity($pdo, 'BATCH', 'Deleted', 'Batch', $batch_id, $batchTitle, "Deleted {$batchTitle}", $batchRow, $input);

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete batch: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
