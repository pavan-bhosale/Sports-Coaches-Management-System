<?php
/**
 * VAVA Sports Academy - Fees & Collections API
 * 
 * Handles real dynamic queries, idempotent monthly fee generation,
 * payment recording, and summary metrics calculation.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';
require_once 'razorpay_config.php';

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

// ── Main Request Handler ─────────────────────────────────────────────────────
$action = $_GET['action'] ?? $_POST['action'] ?? '';
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $action = $input['action'] ?? $action;
}

try {
    // 1. GET FEES LIST (Default Action)
    if ($action === 'get_fees' || empty($action)) {
        $monthParam = $_GET['month'] ?? '';
        $batchParam = $_GET['batch_id'] ?? 'all';
        $statusParam = strtolower(trim($_GET['status'] ?? 'all'));
        $searchParam = trim($_GET['search'] ?? '');
        $sortParam = trim($_GET['sort'] ?? 'name');

        $feeMonth = parseMonthParam($monthParam);

        // Auto-generate missing monthly records for active students
        generateMonthlyFeesForMonth($pdo, $feeMonth);

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

        // Fetch batches for filter dropdown
        $batchesStmt = $pdo->query("SELECT batch_id, batch_name FROM vsa_batches ORDER BY batch_id ASC");
        $batches = $batchesStmt->fetchAll();

        // Fetch available fee months from database
        $monthsStmt = $pdo->query("SELECT DISTINCT fee_month FROM vsa_student_fees ORDER BY fee_month DESC LIMIT 12");
        $availableMonths = $monthsStmt->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array($feeMonth, $availableMonths)) {
            array_unshift($availableMonths, $feeMonth);
        }

        echo json_encode([
            'success' => true,
            'summary' => [
                'total'             => $totalStudents,
                'paid'              => $paidStudents,
                'unpaid'            => $unpaidStudents,
                'paid_percentage'   => $paidPercentage,
                'unpaid_percentage' => $unpaidPercentage,
                'selected_month'    => date('F Y', strtotime($feeMonth)),
                'fee_month_date'    => $feeMonth
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
