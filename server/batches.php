<?php
/**
 * VAVA Sports Academy - Batches API
 * Handles GET (fetch all), POST (create), PUT (update), DELETE (delete by id)
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

// ── GET: fetch all batches ─────────────────────────────────────────────────
if ($method === 'GET') {
    $stmt = $pdo->query('SELECT batch_id, batch_name, batch_location, batch_time, sport, max_students, created_at FROM batches ORDER BY created_at DESC');
    $batches = $stmt->fetchAll();
    echo json_encode(['success' => true, 'batches' => $batches]);
    exit;
}

// ── POST: create a new batch ───────────────────────────────────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $batch_name     = trim($input['batch_name']     ?? '');
    $batch_location = trim($input['batch_location'] ?? '');
    $batch_time     = trim($input['batch_time']     ?? '');
    $sport          = trim($input['sport']          ?? '');
    $max_students   = intval($input['max_students'] ?? 0);

    if (!$batch_name || !$batch_location || !$batch_time || !$sport) {
        http_response_code(400);
        echo json_encode(['error' => 'All required fields must be filled.']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO batches (batch_name, batch_location, batch_time, sport, max_students) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$batch_name, $batch_location, $batch_time, $sport, $max_students]);
    $newId = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'batch' => [
            'batch_id'       => $newId,
            'batch_name'     => $batch_name,
            'batch_location' => $batch_location,
            'batch_time'     => $batch_time,
            'sport'          => $sport,
            'max_students'   => $max_students,
        ]
    ]);
    exit;
}

// ── PUT: update an existing batch ──────────────────────────────────────────
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);

    $batch_id       = intval($input['batch_id']     ?? 0);
    $batch_name     = trim($input['batch_name']     ?? '');
    $batch_location = trim($input['batch_location'] ?? '');
    $batch_time     = trim($input['batch_time']     ?? '');
    $sport          = trim($input['sport']          ?? '');
    $max_students   = intval($input['max_students'] ?? 0);

    if (!$batch_id || !$batch_name || !$batch_location || !$batch_time || !$sport) {
        http_response_code(400);
        echo json_encode(['error' => 'All required fields must be filled.']);
        exit;
    }

    $stmt = $pdo->prepare(
        'UPDATE batches SET batch_name=?, batch_location=?, batch_time=?, sport=?, max_students=? WHERE batch_id=?'
    );
    $stmt->execute([$batch_name, $batch_location, $batch_time, $sport, $max_students, $batch_id]);

    if ($stmt->rowCount() === 0) {
        // rowCount may be 0 if data unchanged; treat as success if batch exists
        $check = $pdo->prepare('SELECT batch_id FROM batches WHERE batch_id=?');
        $check->execute([$batch_id]);
        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Batch not found.']);
            exit;
        }
    }

    echo json_encode(['success' => true]);
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

    $stmt = $pdo->prepare('DELETE FROM batches WHERE batch_id = ?');
    $stmt->execute([$batch_id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Batch not found.']);
        exit;
    }

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
