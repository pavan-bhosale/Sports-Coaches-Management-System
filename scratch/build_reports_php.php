<?php
/**
 * Builder script to generate hardened server/reports.php
 */

$code = <<<'PHP'
<?php
/**
 * VAVA Sports Academy - Reports & Analytics Backend Engine
 * 
 * Provides centralized data extraction, aggregation, report calculation,
 * structured JSON delivery, and server-side A4 PDF document generation.
 * 
 * Strict Data Architecture Adherence:
 * - Uses vsa_student_fees for financial calculations (avoids dead student fee columns)
 * - Uses dynamic student counts for batches (avoids dead batch count columns)
 * - Uses vsa_attendance.batch_id for historical attendance accuracy
 * - Uses vsa_student_fees.batch_id for historical fee batch attribution
 * - Protects against duplicate batch names by keying on batch_id
 * - Uses Asia/Kolkata timezone
 */

date_default_timezone_set('Asia/Kolkata');

// CORS & HTTP Headers
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID, Authorization');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db_connect.php';

// Include Dompdf if available
$dompdfAvailable = file_exists(__DIR__ . '/../vendor/dompdf/autoload.inc.php');
if ($dompdfAvailable) {
    require_once __DIR__ . '/../vendor/dompdf/autoload.inc.php';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION & ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────────────────

function resolveReportsUser($pdo, $input = []) {
    $role = $_SERVER['HTTP_X_VAVA_ROLE'] ?? $_GET['role'] ?? $input['role'] ?? '';
    $email = $_SERVER['HTTP_X_VAVA_EMAIL'] ?? $_GET['email'] ?? $input['email'] ?? '';
    $coach_id = intval($_SERVER['HTTP_X_VAVA_COACH_ID'] ?? $_GET['coach_id'] ?? $input['coach_id'] ?? 0);

    $roleLower = strtolower(trim($role));

    // Students have NO access to Reports & Analytics
    if ($roleLower === 'student') {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Access denied. Reports & Analytics is restricted to coaches and administrators.']);
        exit;
    }

    if ($roleLower === 'coach') {
        $coach = null;
        $query = '
            SELECT 
                c.coach_id,
                c.coach_name,
                c.coach_email,
                c.coach_phone,
                c.status,
                GROUP_CONCAT(b.batch_id) AS assigned_batch_ids
            FROM vsa_coaches c
            LEFT JOIN vsa_batches b ON c.coach_id = b.coach_id
        ';

        if ($coach_id > 0) {
            $stmt = $pdo->prepare($query . ' WHERE c.coach_id = ? GROUP BY c.coach_id');
            $stmt->execute([$coach_id]);
            $coach = $stmt->fetch(PDO::FETCH_ASSOC);
        } elseif (!empty($email)) {
            $stmt = $pdo->prepare($query . ' WHERE LOWER(TRIM(c.coach_email)) = LOWER(TRIM(?)) GROUP BY c.coach_id');
            $stmt->execute([$email]);
            $coach = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if ($coach) {
            $batchIds = [];
            if (!empty($coach['assigned_batch_ids'])) {
                $batchIds = array_map('intval', explode(',', $coach['assigned_batch_ids']));
            }
            $coach['assigned_batch_ids'] = $batchIds;

            return [
                'role'  => 'coach',
                'coach' => $coach
            ];
        }

        return [
            'role'  => 'coach',
            'coach' => [
                'coach_id'           => $coach_id,
                'coach_name'         => 'Coach',
                'coach_email'        => $email,
                'assigned_batch_ids' => []
            ]
        ];
    }

    // Default to superadmin
    return [
        'role'  => 'superadmin',
        'coach' => null
    ];
}

/**
 * Currency Formatter (INR)
 */
function formatRupees($amount) {
    $num = floatval($amount);
    return '₹' . number_format($num, 2, '.', ',');
}

/**
 * Automatically refresh overdue fee statuses before reporting
 */
function refreshOverdueStatuses($pdo) {
    try {
        $pdo->exec("
            UPDATE vsa_student_fees 
            SET payment_status = 'Overdue' 
            WHERE payment_status = 'Unpaid' 
              AND due_date IS NOT NULL 
              AND due_date < CURDATE()
        ");
    } catch (Exception $e) {
        // Non-fatal, continue with current statuses
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DYNAMIC FILTER OPTIONS PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

function getFilterOptions($pdo, $auth) {
    $isCoach = ($auth['role'] === 'coach');
    $coachAssignedBatchIds = $isCoach ? ($auth['coach']['assigned_batch_ids'] ?? []) : [];

    // 1. Batches (with location & timing context to disambiguate duplicates)
    $batchSql = '
        SELECT 
            b.batch_id,
            b.batch_name,
            b.batch_location,
            b.batch_time,
            b.coach_id,
            c.coach_name
        FROM vsa_batches b
        LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
    ';
    if ($isCoach && !empty($coachAssignedBatchIds)) {
        $inClause = implode(',', array_map('intval', $coachAssignedBatchIds));
        $batchSql .= " WHERE b.batch_id IN ($inClause)";
    }
    $batchSql .= ' ORDER BY b.batch_name ASC, b.batch_id ASC';
    $batches = $pdo->query($batchSql)->fetchAll(PDO::FETCH_ASSOC);

    // Count occurrences of batch names to disambiguate duplicates
    $nameCounts = [];
    foreach ($batches as $b) {
        $nm = trim($b['batch_name']);
        $nameCounts[$nm] = ($nameCounts[$nm] ?? 0) + 1;
    }

    $formattedBatches = [];
    foreach ($batches as $b) {
        $displayName = $b['batch_name'];
        if (($nameCounts[trim($b['batch_name'])] ?? 0) > 1) {
            $extra = array_filter([$b['batch_location'], $b['batch_time']]);
            if (!empty($extra)) {
                $displayName .= ' (' . implode(' • ', $extra) . ')';
            } else {
                $displayName .= ' [ID #' . $b['batch_id'] . ']';
            }
        }
        $formattedBatches[] = [
            'batch_id'     => intval($b['batch_id']),
            'batch_name'   => $b['batch_name'],
            'display_name' => $displayName,
            'location'     => $b['batch_location'] ?? '',
            'time'         => $b['batch_time'] ?? '',
            'coach_id'     => $b['coach_id'] ? intval($b['coach_id']) : null,
            'coach_name'   => $b['coach_name'] ?? 'Unassigned'
        ];
    }

    // 2. Coaches
    $coaches = [];
    if (!$isCoach) {
        $cStmt = $pdo->query('SELECT coach_id, coach_name, coach_email FROM vsa_coaches ORDER BY coach_name ASC');
        $coaches = $cStmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $coaches = [[
            'coach_id'   => intval($auth['coach']['coach_id']),
            'coach_name' => $auth['coach']['coach_name'],
            'coach_email'=> $auth['coach']['coach_email']
        ]];
    }

    // 3. Students
    $studSql = 'SELECT student_id, student_name, batch_name FROM vsa_students';
    if ($isCoach && !empty($coachAssignedBatchIds)) {
        $studSql .= ' WHERE batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
    }
    $studSql .= ' ORDER BY student_name ASC';
    $students = $pdo->query($studSql)->fetchAll(PDO::FETCH_ASSOC);

    // 4. Branches & Cities & Genders (Dynamically from DB)
    $branches = $pdo->query('
        SELECT DISTINCT branch_name FROM vsa_students WHERE branch_name IS NOT NULL AND branch_name != ""
        UNION
        SELECT DISTINCT batch_location FROM vsa_batches WHERE batch_location IS NOT NULL AND batch_location != ""
        ORDER BY branch_name ASC
    ')->fetchAll(PDO::FETCH_COLUMN);

    $cities = $pdo->query('
        SELECT DISTINCT city FROM vsa_students WHERE city IS NOT NULL AND city != "" ORDER BY city ASC
    ')->fetchAll(PDO::FETCH_COLUMN);

    $genders = $pdo->query('
        SELECT DISTINCT gender FROM vsa_students WHERE gender IS NOT NULL AND gender != "" ORDER BY gender ASC
    ')->fetchAll(PDO::FETCH_COLUMN);
    if (empty($genders)) {
        $genders = ['Male', 'Female'];
    }

    // 5. Available Fee Months (Dynamically from DB)
    $months = [];
    if (!$isCoach) {
        $mStmt = $pdo->query('SELECT DISTINCT fee_month FROM vsa_student_fees WHERE fee_month IS NOT NULL ORDER BY fee_month DESC');
        $rawMonths = $mStmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($rawMonths as $m) {
            $formattedMonth = date('Y-m', strtotime($m));
            $months[] = [
                'month' => $formattedMonth,
                'date'  => $m,
                'label' => date('F Y', strtotime($m))
            ];
        }
    }

    // 6. Inventory Items (Dynamically from DB)
    $inventoryItems = [];
    if (!$isCoach) {
        $invStmt = $pdo->query('SELECT inventory_id, item_name FROM vsa_inventory ORDER BY item_name ASC');
        $rawInv = $invStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rawInv as $inv) {
            $inventoryItems[] = [
                'id'           => intval($inv['inventory_id']),
                'inventory_id' => intval($inv['inventory_id']),
                'item_name'    => $inv['item_name']
            ];
        }
    }

    // 7. Payment Methods (Dynamically from DB)
    $paymentMethods = [];
    if (!$isCoach) {
        $pmStmt = $pdo->query('SELECT DISTINCT payment_method FROM vsa_student_fees WHERE payment_method IS NOT NULL AND payment_method != "" ORDER BY payment_method ASC');
        $paymentMethods = $pmStmt->fetchAll(PDO::FETCH_COLUMN);
    }
    if (empty($paymentMethods)) {
        $paymentMethods = ['Cash', 'GPay / UPI', 'Bank Transfer', 'Razorpay'];
    }

    return [
        'batches'          => $formattedBatches,
        'coaches'          => $coaches,
        'students'         => $students,
        'branches'         => array_values(array_filter($branches)),
        'cities'           => array_values(array_filter($cities)),
        'genders'          => array_values(array_filter($genders)),
        'months'           => $months,
        'available_months' => $months,
        'inventory_items'  => $inventoryItems,
        'payment_methods'  => array_values($paymentMethods)
    ];
}

PHP;

// Now let's append the report cases
file_put_contents('scratch/reports_part1.txt', $code);
echo "Part 1 generated successfully.\n";
