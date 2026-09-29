<?php
/**
 * Hardened Reports Engine Generator
 */

$fp = fopen('server/reports.php', 'w');

// Write Part 1: Header, Auth, Helpers, FilterOptions
fwrite($fp, <<<'PHP'
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORE REPORT DATA ENGINE (Shared between JSON Preview & PDF Generator)
// ─────────────────────────────────────────────────────────────────────────────

function getReportData($pdo, $reportType, $filters, $auth) {
    $isCoach = ($auth['role'] === 'coach');
    $coachId = $isCoach ? intval($auth['coach']['coach_id'] ?? 0) : 0;
    $coachAssignedBatchIds = $isCoach ? ($auth['coach']['assigned_batch_ids'] ?? []) : [];

    // Financial, inventory, and management reports are strictly Super Admin only
    $adminOnlyReports = [
        'fee_collection', 'monthly_collection_trend', 'payment_methods',
        'outstanding_overdue_fees', 'student_fee_history', 'batch_fee_collection',
        'inventory_status', 'inventory_allocation', 'inventory_movement_audit',
        'inventory_loss_deduction', 'academy_operational_summary', 'monthly_academy_report'
    ];
    if ($isCoach && in_array($reportType, $adminOnlyReports, true)) {
        throw new Exception('Access denied. Financial, inventory, and management reports are restricted to Super Admin only.');
    }

    // Refresh overdue statuses before any financial report calculation
    if (strpos($reportType, 'fee') !== false || $reportType === 'academy_operational_summary' || $reportType === 'monthly_academy_report') {
        refreshOverdueStatuses($pdo);
    }

    $timestamp = date('d F Y, h:i A');
    $report = [
        'type'            => $reportType,
        'title'           => '',
        'category'        => '',
        'period'          => 'All Time / Live Records',
        'generated_at'    => $timestamp,
        'filters_applied' => [],
        'summary_metrics' => [],
        'chart'           => null,
        'table_headers'   => [],
        'table_rows'      => [],
        'empty'           => false,
        'empty_message'   => 'No records matched the selected filters.',
        'notes'           => ''
    ];

    switch ($reportType) {

PHP
);

// Now write all 23 cases
fwrite($fp, <<<'PHP'
        // =====================================================================
        // A. STUDENT REPORTS
        // =====================================================================

        case 'student_overview':
            $report['title'] = 'Student Population Overview Report';
            $report['category'] = 'Student Reports';
            $report['period'] = 'Current Active Database Roster';
            $report['notes'] = 'Reflects currently enrolled student records. Private contact numbers are omitted from formal demographic reporting.';
            $report['table_headers'] = ['Student Name', 'Status', 'Batch', 'Coach', 'Branch', 'Gender', 'Age', 'City', 'School', 'Joined Date'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 's.status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }
            if (!empty($filters['gender']) && $filters['gender'] !== 'all') {
                $where[] = 'LOWER(s.gender) = LOWER(?)';
                $params[] = $filters['gender'];
                $report['filters_applied'][] = ['label' => 'Gender', 'value' => ucfirst($filters['gender'])];
            }
            if (!empty($filters['branch']) && $filters['branch'] !== 'all') {
                $where[] = 's.branch_name = ?';
                $params[] = $filters['branch'];
                $report['filters_applied'][] = ['label' => 'Branch', 'value' => $filters['branch']];
            }
            if (!empty($filters['city']) && $filters['city'] !== 'all') {
                $where[] = 's.city = ?';
                $params[] = $filters['city'];
                $report['filters_applied'][] = ['label' => 'City', 'value' => $filters['city']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $bId = intval($filters['batch_id']);
                $bStmt = $pdo->prepare('SELECT batch_name FROM vsa_batches WHERE batch_id = ?');
                $bStmt->execute([$bId]);
                $bRow = $bStmt->fetch();
                $bName = $bRow['batch_name'] ?? '';
                $where[] = '(s.batch_id = ? OR (s.batch_id IS NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(?))))';
                $params[] = $bId;
                $params[] = $bName;
                $report['filters_applied'][] = ['label' => 'Batch', 'value' => $bName ?: "Batch #$bId"];
            }
            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $cId = intval($filters['coach_id']);
                $cStmt = $pdo->prepare('SELECT coach_name FROM vsa_coaches WHERE coach_id = ?');
                $cStmt->execute([$cId]);
                $cRow = $cStmt->fetch();
                $cName = $cRow['coach_name'] ?? '';
                $where[] = '(s.coach_id = ? OR (s.coach_id IS NULL AND LOWER(TRIM(s.coach_name)) = LOWER(TRIM(?))))';
                $params[] = $cId;
                $params[] = $cName;
                $report['filters_applied'][] = ['label' => 'Coach', 'value' => $cName ?: "Coach #$cId"];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 's.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    s.student_id,
                    s.student_name,
                    s.status,
                    COALESCE(s.batch_name, "Unassigned") AS batch_name,
                    COALESCE(s.coach_name, "Unassigned") AS coach_name,
                    COALESCE(s.branch_name, "—") AS branch_name,
                    COALESCE(s.gender, "—") AS gender,
                    s.date_of_birth,
                    TIMESTAMPDIFF(YEAR, s.date_of_birth, CURDATE()) AS age,
                    COALESCE(s.city, "—") AS city,
                    COALESCE(s.school_name, "—") AS school_name,
                    s.joined_date
                FROM vsa_students s
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY s.student_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $students = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($students)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Students', 'value' => 0, 'subtext' => 'Matching criteria'],
                    ['label' => 'Active Roster', 'value' => 0, 'subtext' => '0% active rate'],
                    ['label' => 'Inactive / On Leave', 'value' => 0, 'subtext' => '0% inactive'],
                    ['label' => 'Gender Ratio (M/F)', 'value' => '0 : 0', 'subtext' => '—']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $total = count($students);
            $activeCount = 0;
            $inactiveCount = 0;
            $maleCount = 0;
            $femaleCount = 0;
            $branchDist = [];

            foreach ($students as $st) {
                if (strtolower($st['status']) === 'active') $activeCount++;
                else $inactiveCount++;

                $g = strtolower(trim($st['gender']));
                if ($g === 'male') $maleCount++;
                elseif ($g === 'female') $femaleCount++;

                $br = $st['branch_name'] ?: 'Other';
                $branchDist[$br] = ($branchDist[$br] ?? 0) + 1;
            }

            $report['summary_metrics'] = [
                ['label' => 'Total Students', 'value' => $total, 'subtext' => 'Matching criteria'],
                ['label' => 'Active Roster', 'value' => $activeCount, 'subtext' => round(($activeCount / max(1, $total)) * 100) . '% active rate'],
                ['label' => 'Inactive / On Leave', 'value' => $inactiveCount, 'subtext' => round(($inactiveCount / max(1, $total)) * 100) . '% inactive'],
                ['label' => 'Gender Ratio (M/F)', 'value' => "$maleCount : $femaleCount", 'subtext' => ($total > 0 ? round(($maleCount / $total) * 100) . '% Male' : '—')]
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Students by Academy Branch',
                'labels' => array_keys($branchDist),
                'datasets' => [[
                    'label' => 'Students',
                    'data'  => array_values($branchDist),
                    'backgroundColor' => '#C9A227'
                ]]
            ];

            foreach ($students as $st) {
                $report['table_rows'][] = [
                    $st['student_name'],
                    $st['status'],
                    $st['batch_name'],
                    $st['coach_name'],
                    $st['branch_name'],
                    ucfirst($st['gender'] ?: '—'),
                    $st['age'] ? ($st['age'] . ' yrs') : '—',
                    $st['city'],
                    $st['school_name'],
                    $st['joined_date'] ? date('d/m/Y', strtotime($st['joined_date'])) : '—'
                ];
            }
            break;

        case 'student_demographics':
            $report['title'] = 'Student Demographics & Diversity Report';
            $report['category'] = 'Student Reports';
            $report['period'] = 'Academy-Wide Population';
            $report['notes'] = 'Demographic distribution across gender, age clusters, blood groups, and geographical residency.';
            $report['table_headers'] = ['Demographic Category', 'Segment', 'Student Count', 'Percentage of Total'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 'status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }
            if (!empty($filters['branch']) && $filters['branch'] !== 'all') {
                $where[] = 'branch_name = ?';
                $params[] = $filters['branch'];
                $report['filters_applied'][] = ['label' => 'Branch', 'value' => $filters['branch']];
            }

            $sql = '
                SELECT 
                    gender,
                    blood_group,
                    city,
                    branch_name,
                    TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) as age
                FROM vsa_students
                WHERE ' . implode(' AND ', $where) . '
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Active Athletes', 'value' => 0, 'subtext' => '0 active roster'],
                    ['label' => 'Male Athletes', 'value' => 0, 'subtext' => '0% of total'],
                    ['label' => 'Female Athletes', 'value' => 0, 'subtext' => '0% of total'],
                    ['label' => 'Primary Age Bracket', 'value' => 'None', 'subtext' => '0 athletes']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $total = count($rows);
            $genderCounts = ['Male' => 0, 'Female' => 0, 'Other' => 0];
            $ageGroups = ['Under 8' => 0, '8 - 11' => 0, '12 - 14' => 0, '15 - 17' => 0, '18+' => 0];
            $bloodGroups = [];
            $cityCounts = [];

            foreach ($rows as $r) {
                $g = ucfirst(strtolower(trim($r['gender'] ?? '')));
                if (isset($genderCounts[$g])) $genderCounts[$g]++;
                else $genderCounts['Other']++;

                $a = intval($r['age'] ?? 0);
                if ($a > 0 && $a < 8) $ageGroups['Under 8']++;
                elseif ($a >= 8 && $a <= 11) $ageGroups['8 - 11']++;
                elseif ($a >= 12 && $a <= 14) $ageGroups['12 - 14']++;
                elseif ($a >= 15 && $a <= 17) $ageGroups['15 - 17']++;
                elseif ($a >= 18) $ageGroups['18+']++;

                $bg = trim($r['blood_group'] ?: 'Unrecorded');
                $bloodGroups[$bg] = ($bloodGroups[$bg] ?? 0) + 1;

                $ct = trim($r['city'] ?: 'Unspecified');
                $cityCounts[$ct] = ($cityCounts[$ct] ?? 0) + 1;
            }

            $topAgeGroup = '8 - 14 Yrs';
            $report['summary_metrics'] = [
                ['label' => 'Active Athletes', 'value' => $total, 'subtext' => 'Matching criteria'],
                ['label' => 'Male Athletes', 'value' => $genderCounts['Male'], 'subtext' => round(($genderCounts['Male'] / max(1, $total)) * 100) . '% of total'],
                ['label' => 'Female Athletes', 'value' => $genderCounts['Female'], 'subtext' => round(($genderCounts['Female'] / max(1, $total)) * 100) . '% of total'],
                ['label' => 'Primary Age Bracket', 'value' => $topAgeGroup, 'subtext' => ($ageGroups['8 - 11'] + $ageGroups['12 - 14']) . ' athletes']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Athletes by Age Cluster',
                'labels' => array_keys($ageGroups),
                'datasets' => [[
                    'label' => 'Students Count',
                    'data'  => array_values($ageGroups),
                    'backgroundColor' => '#C9A227'
                ]]
            ];

            foreach ($genderCounts as $seg => $cnt) {
                if ($cnt > 0) $report['table_rows'][] = ['Gender', $seg, $cnt, round(($cnt / $total) * 100, 1) . '%'];
            }
            foreach ($ageGroups as $seg => $cnt) {
                $report['table_rows'][] = ['Age Cluster', $seg, $cnt, round(($cnt / $total) * 100, 1) . '%'];
            }
            foreach ($bloodGroups as $seg => $cnt) {
                $report['table_rows'][] = ['Blood Group', $seg, $cnt, round(($cnt / $total) * 100, 1) . '%'];
            }
            foreach ($cityCounts as $seg => $cnt) {
                $report['table_rows'][] = ['City / Municipality', $seg, $cnt, round(($cnt / $total) * 100, 1) . '%'];
            }
            break;

        case 'student_enrollment':
            $report['title'] = 'Student Enrollment & Capacity Distribution Report';
            $report['category'] = 'Student Reports';
            $report['period'] = 'Current Operating Distribution';
            $report['notes'] = 'Roster enrollment mapped across batches and locations. Dynamic counts are verified against student profile records.';
            $report['table_headers'] = ['Batch Name', 'Location', 'Schedule / Time', 'Assigned Coach', 'Enrolled Students', 'Share of Total'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['branch']) && $filters['branch'] !== 'all') {
                $where[] = 'b.batch_location = ?';
                $params[] = $filters['branch'];
                $report['filters_applied'][] = ['label' => 'Location / Branch', 'value' => $filters['branch']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'b.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }

            $sql = '
                SELECT 
                    b.batch_id,
                    b.batch_name,
                    b.batch_location,
                    b.batch_time,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name,
                    COUNT(DISTINCT s.student_id) AS student_count
                FROM vsa_batches b
                LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
                LEFT JOIN vsa_students s ON (s.batch_id = b.batch_id OR (s.batch_id IS NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))))
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY b.batch_id
                ORDER BY student_count DESC, b.batch_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Enrolled', 'value' => 0, 'subtext' => '0 active athletes'],
                    ['label' => 'Total Batches', 'value' => 0, 'subtext' => '0 batches found'],
                    ['label' => 'Average per Batch', 'value' => 0, 'subtext' => '0 athletes per batch'],
                    ['label' => 'Unassigned Batches', 'value' => 0, 'subtext' => '0 active students']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totalEnrolled = 0;
            foreach ($rows as $r) {
                $totalEnrolled += intval($r['student_count']);
            }
            $totalBatches = count($rows);
            $activeBatchesCount = 0;
            $batchLabels = [];
            $batchCounts = [];

            foreach ($rows as $r) {
                if ($r['student_count'] > 0) $activeBatchesCount++;
                $batchLabels[] = $r['batch_name'];
                $batchCounts[] = intval($r['student_count']);
            }

            $report['summary_metrics'] = [
                ['label' => 'Total Enrolled', 'value' => $totalEnrolled, 'subtext' => 'Active athletes'],
                ['label' => 'Total Batches', 'value' => $totalBatches, 'subtext' => "$activeBatchesCount with active students"],
                ['label' => 'Average per Batch', 'value' => $totalBatches > 0 ? round($totalEnrolled / $totalBatches, 1) : 0, 'subtext' => 'Athletes per batch'],
                ['label' => 'Unassigned Batches', 'value' => ($totalBatches - $activeBatchesCount), 'subtext' => '0 active students']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Enrolled Students by Batch',
                'labels' => array_slice($batchLabels, 0, 10),
                'datasets' => [[
                    'label' => 'Athletes Enrolled',
                    'data'  => array_slice($batchCounts, 0, 10),
                    'backgroundColor' => '#C9A227'
                ]]
            ];

            foreach ($rows as $r) {
                $share = $totalEnrolled > 0 ? round(($r['student_count'] / $totalEnrolled) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $r['batch_name'],
                    $r['batch_location'] ?: '—',
                    $r['batch_time'] ?: '—',
                    $r['coach_name'],
                    intval($r['student_count']),
                    "$share%"
                ];
            }
            break;

PHP
);

// Now write Part 3: Attendance reports
fwrite($fp, <<<'PHP'
        // =====================================================================
        // B. ATTENDANCE REPORTS
        // =====================================================================

        case 'attendance_summary':
            $report['title'] = 'Comprehensive Attendance Summary Report';
            $report['category'] = 'Attendance Reports';
            $report['notes'] = 'Authoritative historical attendance calculated from vsa_attendance.batch_id. Attendance % = (Present Records / Total Session Records) * 100.';
            $report['table_headers'] = ['Date', 'Batch', 'Coach', 'Total Roll-Calls', 'Present', 'Absent', 'Attendance %'];

            $startDate = trim($filters['start_date'] ?? date('Y-m-01'));
            $endDate   = trim($filters['end_date'] ?? date('Y-m-d'));

            $where = ['a.attendance_date BETWEEN ? AND ?'];
            $params = [$startDate, $endDate];
            $report['period'] = date('d M Y', strtotime($startDate)) . ' – ' . date('d M Y', strtotime($endDate));
            $report['filters_applied'][] = ['label' => 'Date Range', 'value' => $report['period']];

            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $bId = intval($filters['batch_id']);
                $where[] = 'a.batch_id = ?';
                $params[] = $bId;

                $bStmt = $pdo->prepare('SELECT batch_name FROM vsa_batches WHERE batch_id = ?');
                $bStmt->execute([$bId]);
                $bRow = $bStmt->fetch();
                $report['filters_applied'][] = ['label' => 'Batch', 'value' => $bRow['batch_name'] ?? "Batch #$bId"];
            }

            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $cId = intval($filters['coach_id']);
                $where[] = 'a.coach_id = ?';
                $params[] = $cId;

                $cStmt = $pdo->prepare('SELECT coach_name FROM vsa_coaches WHERE coach_id = ?');
                $cStmt->execute([$cId]);
                $cRow = $cStmt->fetch();
                $report['filters_applied'][] = ['label' => 'Recording Coach', 'value' => $cRow['coach_name'] ?? "Coach #$cId"];
            }

            if (!empty($filters['student_id']) && $filters['student_id'] !== 'all') {
                $sId = intval($filters['student_id']);
                $where[] = 'a.student_id = ?';
                $params[] = $sId;
                $report['filters_applied'][] = ['label' => 'Student ID', 'value' => '#' . $sId];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'a.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    a.attendance_date,
                    a.batch_id,
                    b.batch_name,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name,
                    COUNT(a.attendance_id) AS total_records,
                    SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN a.status = "Absent" THEN 1 ELSE 0 END) AS absent_count
                FROM vsa_attendance a
                LEFT JOIN vsa_batches b ON a.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON a.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY a.attendance_date, a.batch_id, b.batch_name, coach_name
                ORDER BY a.attendance_date DESC, b.batch_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Records', 'value' => 0, 'subtext' => '0 roll-calls recorded'],
                    ['label' => 'Present Records', 'value' => 0, 'subtext' => '0% attendance rate'],
                    ['label' => 'Absent Records', 'value' => 0, 'subtext' => '0% absence rate'],
                    ['label' => 'Attendance Days', 'value' => 0, 'subtext' => '0 tracking sessions']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totalRecords = 0;
            $totalPresent = 0;
            $totalAbsent = 0;
            $uniqueDates = [];
            $batchComparison = [];

            foreach ($rows as $r) {
                $tot = intval($r['total_records']);
                $prs = intval($r['present_count']);
                $abs = intval($r['absent_count']);
                $totalRecords += $tot;
                $totalPresent += $prs;
                $totalAbsent += $abs;
                $uniqueDates[$r['attendance_date']] = true;

                $bName = $r['batch_name'] ?: 'Unassigned Batch';
                if (!isset($batchComparison[$bName])) {
                    $batchComparison[$bName] = ['present' => 0, 'absent' => 0, 'total' => 0];
                }
                $batchComparison[$bName]['present'] += $prs;
                $batchComparison[$bName]['absent']  += $abs;
                $batchComparison[$bName]['total']   += $tot;
            }

            $overallPct = $totalRecords > 0 ? round(($totalPresent / $totalRecords) * 100, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Total Records', 'value' => $totalRecords, 'subtext' => count($rows) . ' session sheets'],
                ['label' => 'Present Records', 'value' => $totalPresent, 'subtext' => "$overallPct% attendance rate"],
                ['label' => 'Absent Records', 'value' => $totalAbsent, 'subtext' => round(100 - $overallPct, 1) . '% absence rate'],
                ['label' => 'Attendance Days', 'value' => count($uniqueDates), 'subtext' => 'Days with recorded sheets']
            ];

            // Chart: Batch Comparison
            $bLabels = array_keys($batchComparison);
            $bPresent = array_map(function($k) use ($batchComparison) { return $batchComparison[$k]['present']; }, $bLabels);
            $bAbsent  = array_map(function($k) use ($batchComparison) { return $batchComparison[$k]['absent']; }, $bLabels);

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Attendance Distribution by Batch',
                'labels' => $bLabels,
                'datasets' => [
                    ['label' => 'Present', 'data' => $bPresent, 'backgroundColor' => '#22C55E'],
                    ['label' => 'Absent',  'data' => $bAbsent,  'backgroundColor' => '#EF4444']
                ]
            ];

            foreach ($rows as $r) {
                $tot = intval($r['total_records']);
                $prs = intval($r['present_count']);
                $abs = intval($r['absent_count']);
                $pct = $tot > 0 ? round(($prs / $tot) * 100, 1) : 0;
                $report['table_rows'][] = [
                    date('d/m/Y', strtotime($r['attendance_date'])),
                    $r['batch_name'] ?: 'Unassigned',
                    $r['coach_name'],
                    $tot,
                    $prs,
                    $abs,
                    "$pct%"
                ];
            }
            break;

        case 'student_attendance':
            $report['title'] = 'Individual Student Attendance Ledger';
            $report['category'] = 'Attendance Reports';
            $report['notes'] = 'Historical record of student training presence. Derived from vsa_attendance linked via student_id and historical batch_id.';
            $report['table_headers'] = ['Session Date', 'Student Name', 'Batch', 'Coach', 'Recorded Status'];

            $studentId = intval($filters['student_id'] ?? 0);
            $where = ['1=1'];
            $params = [];

            if ($studentId > 0) {
                $where[] = 'a.student_id = ?';
                $params[] = $studentId;

                $stStmt = $pdo->prepare('SELECT student_name FROM vsa_students WHERE student_id = ?');
                $stStmt->execute([$studentId]);
                $stRow = $stStmt->fetch();
                $stName = $stRow['student_name'] ?? "Student #$studentId";
                $report['filters_applied'][] = ['label' => 'Student', 'value' => $stName];
            }

            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'a.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }

            if (!empty($filters['start_date']) && !empty($filters['end_date'])) {
                $where[] = 'a.attendance_date BETWEEN ? AND ?';
                $params[] = $filters['start_date'];
                $params[] = $filters['end_date'];
                $report['period'] = date('d M Y', strtotime($filters['start_date'])) . ' – ' . date('d M Y', strtotime($filters['end_date']));
                $report['filters_applied'][] = ['label' => 'Date Range', 'value' => $report['period']];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'a.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    a.attendance_date,
                    a.status,
                    s.student_name,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name
                FROM vsa_attendance a
                LEFT JOIN vsa_students s ON a.student_id = s.student_id
                LEFT JOIN vsa_batches b ON a.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON a.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY a.attendance_date DESC
                LIMIT 500
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Sessions Recorded', 'value' => 0, 'subtext' => '0 roll-calls recorded'],
                    ['label' => 'Present Count', 'value' => 0, 'subtext' => '0% attendance rate'],
                    ['label' => 'Absent Count', 'value' => 0, 'subtext' => '0 sessions missed'],
                    ['label' => 'Attendance Rate', 'value' => '0%', 'subtext' => 'No active records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totSessions = count($rows);
            $presentCnt = 0;
            $absentCnt = 0;
            foreach ($rows as $r) {
                if ($r['status'] === 'Present') $presentCnt++;
                elseif ($r['status'] === 'Absent') $absentCnt++;
            }

            $attPct = $totSessions > 0 ? round(($presentCnt / $totSessions) * 100, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Sessions Recorded', 'value' => $totSessions, 'subtext' => 'In selected timeframe'],
                ['label' => 'Present Count', 'value' => $presentCnt, 'subtext' => "$attPct% attendance rate"],
                ['label' => 'Absent Count', 'value' => $absentCnt, 'subtext' => round(100 - $attPct, 1) . '% absence rate'],
                ['label' => 'Attendance Rate', 'value' => "$attPct%", 'subtext' => 'Presence adherence']
            ];

            $report['chart'] = [
                'type'   => 'doughnut',
                'title'  => 'Attendance Adherence',
                'labels' => ['Present', 'Absent'],
                'datasets' => [[
                    'data' => [$presentCnt, $absentCnt],
                    'backgroundColor' => ['#22C55E', '#EF4444']
                ]]
            ];

            foreach ($rows as $r) {
                $report['table_rows'][] = [
                    date('d/m/Y', strtotime($r['attendance_date'])),
                    $r['student_name'] ?: 'Unknown Student',
                    $r['batch_name'],
                    $r['coach_name'],
                    $r['status']
                ];
            }
            break;

        case 'batch_attendance':
            $report['title'] = 'Batch Session Attendance Analytics';
            $report['category'] = 'Attendance Reports';
            $report['notes'] = 'Aggregates roll-call presence recorded specifically against the batch session sheets.';
            $report['table_headers'] = ['Session Date', 'Present Count', 'Absent Count', 'Total Roll-Calls', 'Attendance %'];

            $batchId = intval($filters['batch_id'] ?? 0);
            $where = ['1=1'];
            $params = [];

            if ($batchId > 0) {
                $where[] = 'a.batch_id = ?';
                $params[] = $batchId;

                $bStmt = $pdo->prepare('SELECT batch_name FROM vsa_batches WHERE batch_id = ?');
                $bStmt->execute([$batchId]);
                $bRow = $bStmt->fetch();
                $bName = $bRow['batch_name'] ?? "Batch #$batchId";
                $report['title'] = "Batch Attendance: {$bName}";
                $report['filters_applied'][] = ['label' => 'Batch', 'value' => $bName];
            }

            if (!empty($filters['start_date']) && !empty($filters['end_date'])) {
                $where[] = 'a.attendance_date BETWEEN ? AND ?';
                $params[] = $filters['start_date'];
                $params[] = $filters['end_date'];
                $report['period'] = date('d M Y', strtotime($filters['start_date'])) . ' – ' . date('d M Y', strtotime($filters['end_date']));
                $report['filters_applied'][] = ['label' => 'Date Range', 'value' => $report['period']];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'a.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    a.attendance_date,
                    COUNT(a.attendance_id) AS total_records,
                    SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN a.status = "Absent" THEN 1 ELSE 0 END) AS absent_count
                FROM vsa_attendance a
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY a.attendance_date
                ORDER BY a.attendance_date DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Sessions', 'value' => 0, 'subtext' => '0 conducted sessions'],
                    ['label' => 'Present Count', 'value' => 0, 'subtext' => '0% attendance rate'],
                    ['label' => 'Absent Count', 'value' => 0, 'subtext' => '0 absences'],
                    ['label' => 'Average Attendance %', 'value' => '0%', 'subtext' => 'No active records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totSess = count($rows);
            $sumPresent = 0;
            $sumAbsent = 0;
            $sumRecords = 0;
            $dates = [];
            $rates = [];

            foreach ($rows as $r) {
                $prs = intval($r['present_count']);
                $abs = intval($r['absent_count']);
                $tot = intval($r['total_records']);
                $sumPresent += $prs;
                $sumAbsent += $abs;
                $sumRecords += $tot;

                $dates[] = date('d/m', strtotime($r['attendance_date']));
                $rates[] = $tot > 0 ? round(($prs / $tot) * 100, 1) : 0;
            }

            $avgRate = $sumRecords > 0 ? round(($sumPresent / $sumRecords) * 100, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Total Sessions', 'value' => $totSess, 'subtext' => 'Conducted training sessions'],
                ['label' => 'Present Count', 'value' => $sumPresent, 'subtext' => "$avgRate% attendance rate"],
                ['label' => 'Absent Count', 'value' => $sumAbsent, 'subtext' => round(100 - $avgRate, 1) . '% absence rate'],
                ['label' => 'Average Attendance %', 'value' => "$avgRate%", 'subtext' => 'Across all sessions']
            ];

            $report['chart'] = [
                'type'   => 'line',
                'title'  => 'Attendance % Trend by Session Date',
                'labels' => array_reverse(array_slice($dates, 0, 15)),
                'datasets' => [[
                    'label' => 'Attendance %',
                    'data'  => array_reverse(array_slice($rates, 0, 15)),
                    'borderColor' => '#C9A227',
                    'backgroundColor' => 'rgba(201, 162, 39, 0.15)'
                ]]
            ];

            foreach ($rows as $r) {
                $tot = intval($r['total_records']);
                $prs = intval($r['present_count']);
                $abs = intval($r['absent_count']);
                $pct = $tot > 0 ? round(($prs / $tot) * 100, 1) : 0;
                $report['table_rows'][] = [
                    date('d/m/Y', strtotime($r['attendance_date'])),
                    $prs,
                    $abs,
                    $tot,
                    "$pct%"
                ];
            }
            break;

        case 'coach_attendance_activity':
            $report['title'] = 'Coach Attendance Tracking Activity Log';
            $report['category'] = 'Attendance Reports';
            $report['notes'] = 'Factual audit log of session attendance sheets recorded by coaching personnel in vsa_attendance.coach_id. Strictly an operational log.';
            $report['table_headers'] = ['Coach Name', 'Attendance Sheets', 'Total Roll-Calls', 'Present Recorded', 'Absent Recorded', 'Attendance %'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $where[] = 'a.coach_id = ?';
                $params[] = intval($filters['coach_id']);
                $report['filters_applied'][] = ['label' => 'Coach ID', 'value' => '#' . $filters['coach_id']];
            }

            if (!empty($filters['start_date']) && !empty($filters['end_date'])) {
                $where[] = 'a.attendance_date BETWEEN ? AND ?';
                $params[] = $filters['start_date'];
                $params[] = $filters['end_date'];
                $report['period'] = date('d M Y', strtotime($filters['start_date'])) . ' – ' . date('d M Y', strtotime($filters['end_date']));
                $report['filters_applied'][] = ['label' => 'Date Range', 'value' => $report['period']];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'a.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    a.coach_id,
                    COALESCE(c.coach_name, "Unassigned / Admin") AS coach_name,
                    COUNT(DISTINCT CONCAT(a.attendance_date, "-", a.batch_id)) AS sheet_count,
                    COUNT(a.attendance_id) AS total_records,
                    SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN a.status = "Absent" THEN 1 ELSE 0 END) AS absent_count
                FROM vsa_attendance a
                LEFT JOIN vsa_coaches c ON a.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY a.coach_id, coach_name
                ORDER BY sheet_count DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Active Coaches Logged', 'value' => 0, 'subtext' => '0 coaches found'],
                    ['label' => 'Total Sessions Logged', 'value' => 0, 'subtext' => '0 roll-call sheets'],
                    ['label' => 'Total Student Records', 'value' => 0, 'subtext' => '0 athlete calls'],
                    ['label' => 'Overall Presence Rate', 'value' => '0%', 'subtext' => 'No active logs']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totCoaches = count($rows);
            $totSheets = 0;
            $totCalls = 0;
            $totPresent = 0;
            $cNames = [];
            $cSheets = [];

            foreach ($rows as $r) {
                $totSheets  += intval($r['sheet_count']);
                $totCalls   += intval($r['total_records']);
                $totPresent += intval($r['present_count']);
                $cNames[]   = $r['coach_name'];
                $cSheets[]  = intval($r['sheet_count']);
            }

            $avgRate = $totCalls > 0 ? round(($totPresent / $totCalls) * 100, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Active Coaches Logged', 'value' => $totCoaches, 'subtext' => 'Coaches with sheets'],
                ['label' => 'Total Sessions Logged', 'value' => $totSheets, 'subtext' => 'Individual roll-call sheets'],
                ['label' => 'Total Student Records', 'value' => $totCalls, 'subtext' => "$totPresent presents logged"],
                ['label' => 'Overall Presence Rate', 'value' => "$avgRate%", 'subtext' => 'Recorded presence rate']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Attendance Sheets Logged by Coach',
                'labels' => $cNames,
                'datasets' => [[
                    'label' => 'Sheets Logged',
                    'data'  => $cSheets,
                    'backgroundColor' => '#C9A227'
                ]]
            ];

            foreach ($rows as $r) {
                $tot = intval($r['total_records']);
                $prs = intval($r['present_count']);
                $pct = $tot > 0 ? round(($prs / $tot) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $r['coach_name'],
                    intval($r['sheet_count']),
                    $tot,
                    $prs,
                    intval($r['absent_count']),
                    "$pct%"
                ];
            }
            break;

PHP
);

// Now write Part 4: Batches & Coaches reports
fwrite($fp, <<<'PHP'
        // =====================================================================
        // C. BATCH REPORTS
        // =====================================================================

        case 'batch_enrollment':
            $report['title'] = 'Batch Roster & Enrollment Audit';
            $report['category'] = 'Batch Reports';
            $report['notes'] = 'Authoritative batch headcounts calculated dynamically from student records.';
            $report['table_headers'] = ['Batch Name', 'Location', 'Schedule / Time', 'Assigned Coach', 'Current Students', 'Status'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'b.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $where[] = 'b.coach_id = ?';
                $params[] = intval($filters['coach_id']);
                $report['filters_applied'][] = ['label' => 'Coach ID', 'value' => '#' . $filters['coach_id']];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'b.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    b.batch_id,
                    b.batch_name,
                    b.batch_location,
                    b.batch_time,
                    b.status,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name,
                    COUNT(DISTINCT s.student_id) AS student_count
                FROM vsa_batches b
                LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
                LEFT JOIN vsa_students s ON (s.batch_id = b.batch_id OR (s.batch_id IS NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))))
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY b.batch_id
                ORDER BY b.batch_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Batches', 'value' => 0, 'subtext' => '0 batches found'],
                    ['label' => 'Active Batches', 'value' => 0, 'subtext' => '0 active batches'],
                    ['label' => 'Total Enrolled Students', 'value' => 0, 'subtext' => '0 athletes total'],
                    ['label' => 'Average Students / Batch', 'value' => 0, 'subtext' => '0 athletes per batch']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totBatches = count($rows);
            $activeBatches = 0;
            $totStudents = 0;

            foreach ($rows as $r) {
                if (strtolower($r['status']) === 'active') $activeBatches++;
                $totStudents += intval($r['student_count']);
            }

            $avgStudents = $totBatches > 0 ? round($totStudents / $totBatches, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Total Batches', 'value' => $totBatches, 'subtext' => 'Configured training batches'],
                ['label' => 'Active Batches', 'value' => $activeBatches, 'subtext' => round(($activeBatches / max(1, $totBatches)) * 100) . '% operating'],
                ['label' => 'Total Enrolled Students', 'value' => $totStudents, 'subtext' => 'Athletes dynamically mapped'],
                ['label' => 'Average Students / Batch', 'value' => $avgStudents, 'subtext' => 'Athletes per batch']
            ];

            foreach ($rows as $r) {
                $report['table_rows'][] = [
                    $r['batch_name'],
                    $r['batch_location'] ?: '—',
                    $r['batch_time'] ?: '—',
                    $r['coach_name'],
                    intval($r['student_count']),
                    ucfirst($r['status'] ?: 'Active')
                ];
            }
            break;

        case 'batch_attendance_comparison':
            $report['title'] = 'Batch Attendance Comparison Report';
            $report['category'] = 'Batch Reports';
            $report['notes'] = 'Compares attendance session density and presence rates across training batches using historical attendance.batch_id.';
            $report['table_headers'] = ['Batch Name', 'Assigned Coach', 'Sessions Conducted', 'Present Count', 'Absent Count', 'Attendance %'];

            $startDate = trim($filters['start_date'] ?? date('Y-m-01'));
            $endDate   = trim($filters['end_date'] ?? date('Y-m-d'));

            $where = ['a.attendance_date BETWEEN ? AND ?'];
            $params = [$startDate, $endDate];
            $report['period'] = date('d M Y', strtotime($startDate)) . ' – ' . date('d M Y', strtotime($endDate));
            $report['filters_applied'][] = ['label' => 'Date Range', 'value' => $report['period']];

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'a.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    a.batch_id,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name,
                    COUNT(DISTINCT a.attendance_date) AS session_count,
                    COUNT(a.attendance_id) AS total_records,
                    SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN a.status = "Absent" THEN 1 ELSE 0 END) AS absent_count
                FROM vsa_attendance a
                LEFT JOIN vsa_batches b ON a.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY a.batch_id, batch_name, coach_name
                ORDER BY present_count DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Batches Evaluated', 'value' => 0, 'subtext' => '0 active batches'],
                    ['label' => 'Total Sessions Conducted', 'value' => 0, 'subtext' => '0 sessions held'],
                    ['label' => 'Total Attendances', 'value' => 0, 'subtext' => '0 athlete presences'],
                    ['label' => 'Overall Attendance %', 'value' => '0%', 'subtext' => 'No active logs']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totBatches = count($rows);
            $totSessions = 0;
            $totCalls = 0;
            $totPresent = 0;
            $bNames = [];
            $bRates = [];

            foreach ($rows as $r) {
                $totSessions += intval($r['session_count']);
                $totCalls    += intval($r['total_records']);
                $totPresent  += intval($r['present_count']);

                $prs = intval($r['present_count']);
                $tot = intval($r['total_records']);
                $pct = $tot > 0 ? round(($prs / $tot) * 100, 1) : 0;

                $bNames[] = $r['batch_name'];
                $bRates[] = $pct;
            }

            $avgRate = $totCalls > 0 ? round(($totPresent / $totCalls) * 100, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Batches Evaluated', 'value' => $totBatches, 'subtext' => 'Active batches with sheets'],
                ['label' => 'Total Sessions Conducted', 'value' => $totSessions, 'subtext' => 'Across evaluated batches'],
                ['label' => 'Total Attendances', 'value' => $totPresent, 'subtext' => "$totCalls roll-calls total"],
                ['label' => 'Overall Attendance %', 'value' => "$avgRate%", 'subtext' => 'Macro presence average']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Attendance % by Batch',
                'labels' => $bNames,
                'datasets' => [[
                    'label' => 'Attendance Rate (%)',
                    'data'  => $bRates,
                    'backgroundColor' => '#22C55E'
                ]]
            ];

            foreach ($rows as $r) {
                $prs = intval($r['present_count']);
                $tot = intval($r['total_records']);
                $pct = $tot > 0 ? round(($prs / $tot) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $r['batch_name'],
                    $r['coach_name'],
                    intval($r['session_count']),
                    $prs,
                    intval($r['absent_count']),
                    "$pct%"
                ];
            }
            break;

        case 'batch_fee_collection':
            $report['title'] = 'Batch Financial Collection Analysis';
            $report['category'] = 'Batch Reports';
            $report['notes'] = 'Aggregates billed obligations and realized collections by batch using vsa_student_fees.batch_id.';
            $report['table_headers'] = ['Batch Name', 'Billing Month', 'Billed Amount', 'Collected Amount', 'Outstanding Amount', 'Realization %'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['month']) && $filters['month'] !== 'all') {
                $where[] = "DATE_FORMAT(f.fee_month, '%Y-%m') = ?";
                $params[] = substr($filters['month'], 0, 7);
                $report['filters_applied'][] = ['label' => 'Month', 'value' => $filters['month']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'f.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 'f.payment_status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }

            $sql = '
                SELECT 
                    f.batch_id,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name,
                    DATE_FORMAT(f.fee_month, "%b %Y") AS fee_month_label,
                    SUM(f.fee_amount) AS total_billed,
                    SUM(f.paid_amount) AS total_collected
                FROM vsa_student_fees f
                LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY f.batch_id, batch_name, fee_month_label
                ORDER BY total_billed DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Billed', 'value' => formatRupees(0), 'subtext' => '0 billed accounts'],
                    ['label' => 'Total Collected', 'value' => formatRupees(0), 'subtext' => '0% realization rate'],
                    ['label' => 'Total Outstanding', 'value' => formatRupees(0), 'subtext' => '0 outstanding exposure'],
                    ['label' => 'Realization %', 'value' => '0%', 'subtext' => 'No active billing records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totBilled = 0;
            $totCollected = 0;
            $bNames = [];
            $bCollected = [];
            $bOutstanding = [];

            foreach ($rows as $r) {
                $bld = floatval($r['total_billed']);
                $clt = floatval($r['total_collected']);
                $totBilled += $bld;
                $totCollected += $clt;

                $bNames[] = $r['batch_name'] . ' (' . $r['fee_month_label'] . ')';
                $bCollected[] = $clt;
                $bOutstanding[] = max(0, $bld - $clt);
            }

            $totOutstanding = max(0, $totBilled - $totCollected);
            $overallRealization = $totBilled > 0 ? round(($totCollected / $totBilled) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Billed', 'value' => formatRupees($totBilled), 'subtext' => 'Invoiced across batches'],
                ['label' => 'Total Collected', 'value' => formatRupees($totCollected), 'subtext' => "$overallRealization% collection realization"],
                ['label' => 'Total Outstanding', 'value' => formatRupees($totOutstanding), 'subtext' => 'Unpaid / Overdue dues'],
                ['label' => 'Realization %', 'value' => "$overallRealization%", 'subtext' => 'Collected vs Invoiced']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Collections vs Outstanding by Batch',
                'labels' => array_slice($bNames, 0, 8),
                'datasets' => [
                    ['label' => 'Collected (₹)', 'data' => array_slice($bCollected, 0, 8), 'backgroundColor' => '#22C55E'],
                    ['label' => 'Outstanding (₹)', 'data' => array_slice($bOutstanding, 0, 8), 'backgroundColor' => '#F59E0B']
                ]
            ];

            foreach ($rows as $r) {
                $bld = floatval($r['total_billed']);
                $clt = floatval($r['total_collected']);
                $out = max(0, $bld - $clt);
                $pct = $bld > 0 ? round(($clt / $bld) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $r['batch_name'],
                    $r['fee_month_label'],
                    formatRupees($bld),
                    formatRupees($clt),
                    formatRupees($out),
                    "$pct%"
                ];
            }
            break;

        // =====================================================================
        // D. COACH REPORTS
        // =====================================================================

        case 'coach_roster':
            $report['title'] = 'Master Coaching Staff Directory';
            $report['category'] = 'Coach Reports';
            $report['notes'] = 'Factual roster of academy coaching staff, active status, joining dates, and assigned batches.';
            $report['table_headers'] = ['Coach Name', 'Email', 'Phone', 'Specialization / License', 'Status', 'Joining Date', 'Batches Assigned'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 'c.status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }

            $sql = '
                SELECT 
                    c.coach_id,
                    c.coach_name,
                    c.coach_email,
                    c.coach_phone,
                    COALESCE(c.coach_license, "—") AS license,
                    c.status,
                    c.coach_joined_date AS joining_date,
                    COUNT(b.batch_id) AS batch_count
                FROM vsa_coaches c
                LEFT JOIN vsa_batches b ON c.coach_id = b.coach_id
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY c.coach_id
                ORDER BY c.coach_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Coaches', 'value' => 0, 'subtext' => '0 coaches found'],
                    ['label' => 'Active Coaches', 'value' => 0, 'subtext' => '0 active staff'],
                    ['label' => 'Inactive Coaches', 'value' => 0, 'subtext' => '0 inactive'],
                    ['label' => 'Assigned Batches Total', 'value' => 0, 'subtext' => '0 training batches']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totCoaches = count($rows);
            $activeCoaches = 0;
            $inactiveCoaches = 0;
            $totBatchesAssigned = 0;

            foreach ($rows as $r) {
                if (strtolower($r['status']) === 'active') $activeCoaches++;
                else $inactiveCoaches++;
                $totBatchesAssigned += intval($r['batch_count']);
            }

            $report['summary_metrics'] = [
                ['label' => 'Total Coaches', 'value' => $totCoaches, 'subtext' => 'Roster staff members'],
                ['label' => 'Active Coaches', 'value' => $activeCoaches, 'subtext' => round(($activeCoaches / max(1, $totCoaches)) * 100) . '% active rate'],
                ['label' => 'Inactive Coaches', 'value' => $inactiveCoaches, 'subtext' => 'On leave or inactive'],
                ['label' => 'Assigned Batches Total', 'value' => $totBatchesAssigned, 'subtext' => 'Active training assignments']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Batches Supervised per Coach',
                'labels' => array_column($rows, 'coach_name'),
                'datasets' => [[
                    'label' => 'Assigned Batches',
                    'data'  => array_column($rows, 'batch_count'),
                    'backgroundColor' => '#C9A227'
                ]]
            ];

            foreach ($rows as $r) {
                $report['table_rows'][] = [
                    $r['coach_name'],
                    $r['coach_email'] ?: '—',
                    $r['coach_phone'] ?: '—',
                    $r['license'],
                    ucfirst($r['status'] ?: 'Active'),
                    $r['joining_date'] ? date('d/m/Y', strtotime($r['joining_date'])) : '—',
                    intval($r['batch_count'])
                ];
            }
            break;

        case 'coach_batch_assignment':
            $report['title'] = 'Current Coach Batch Assignments & Coverage';
            $report['category'] = 'Coach Reports';
            $report['notes'] = 'Factual cross-reference of current coach-to-batch assignments and student athlete counts.';
            $report['table_headers'] = ['Coach Name', 'Assigned Batch', 'Location', 'Timing', 'Enrolled Students', 'Sport'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $where[] = 'c.coach_id = ?';
                $params[] = intval($filters['coach_id']);
                $report['filters_applied'][] = ['label' => 'Coach ID', 'value' => '#' . $filters['coach_id']];
            }

            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $where[] = 'b.batch_id IN (' . implode(',', array_map('intval', $coachAssignedBatchIds)) . ')';
            }

            $sql = '
                SELECT 
                    c.coach_name,
                    b.batch_name,
                    b.batch_location,
                    b.batch_time,
                    b.sport,
                    COUNT(DISTINCT s.student_id) AS student_count
                FROM vsa_batches b
                JOIN vsa_coaches c ON b.coach_id = c.coach_id
                LEFT JOIN vsa_students s ON (s.batch_id = b.batch_id OR (s.batch_id IS NULL AND LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name))))
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY b.batch_id, c.coach_name, b.batch_name, b.batch_location, b.batch_time, b.sport
                ORDER BY c.coach_name ASC, b.batch_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Assigned Coaches', 'value' => 0, 'subtext' => '0 active coaches'],
                    ['label' => 'Total Batch Assignments', 'value' => 0, 'subtext' => '0 batches assigned'],
                    ['label' => 'Total Coached Athletes', 'value' => 0, 'subtext' => '0 athletes total'],
                    ['label' => 'Average Athletes / Coach', 'value' => 0, 'subtext' => '0 athletes per coach']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $distinctCoaches = [];
            $totAthletes = 0;
            foreach ($rows as $r) {
                $distinctCoaches[$r['coach_name']] = true;
                $totAthletes += intval($r['student_count']);
            }

            $coachCnt = count($distinctCoaches);
            $avgAthletes = $coachCnt > 0 ? round($totAthletes / $coachCnt, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Assigned Coaches', 'value' => $coachCnt, 'subtext' => 'Supervising batches'],
                ['label' => 'Total Batch Assignments', 'value' => count($rows), 'subtext' => 'Batch schedules active'],
                ['label' => 'Total Coached Athletes', 'value' => $totAthletes, 'subtext' => 'Enrolled across assignments'],
                ['label' => 'Average Athletes / Coach', 'value' => $avgAthletes, 'subtext' => 'Athletes per coach']
            ];

            foreach ($rows as $r) {
                $report['table_rows'][] = [
                    $r['coach_name'],
                    $r['batch_name'],
                    $r['batch_location'] ?: '—',
                    $r['batch_time'] ?: '—',
                    intval($r['student_count']),
                    $r['sport'] ?: 'Football'
                ];
            }
            break;

PHP
);

// Now write Part 5: Fees & Payments reports
fwrite($fp, <<<'PHP'
        // =====================================================================
        // E. FEES & PAYMENTS REPORTS
        // =====================================================================

        case 'fee_collection':
            $report['title'] = 'Comprehensive Fee Collection & Realization Ledger';
            $report['category'] = 'Fees & Payments';
            $report['notes'] = 'Authoritative accounting records from vsa_student_fees. Overdue status reflects records past due date.';
            $report['table_headers'] = ['Billing Month', 'Student Name', 'Batch', 'Due Date', 'Billed Amount', 'Paid Amount', 'Status', 'Payment Method', 'Paid Date'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['month']) && $filters['month'] !== 'all') {
                $where[] = "DATE_FORMAT(f.fee_month, '%Y-%m') = ?";
                $params[] = substr($filters['month'], 0, 7);
                $report['period'] = date('F Y', strtotime($filters['month'] . '-01'));
                $report['filters_applied'][] = ['label' => 'Billing Month', 'value' => $report['period']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'f.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 'f.payment_status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }
            if (!empty($filters['payment_method']) && $filters['payment_method'] !== 'all') {
                $where[] = 'f.payment_method = ?';
                $params[] = $filters['payment_method'];
                $report['filters_applied'][] = ['label' => 'Method', 'value' => $filters['payment_method']];
            }

            $sql = '
                SELECT 
                    f.fee_id,
                    f.fee_month,
                    f.due_date,
                    f.fee_amount,
                    f.paid_amount,
                    f.payment_status,
                    f.payment_method,
                    f.paid_at AS paid_timestamp,
                    s.student_name,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name
                FROM vsa_student_fees f
                LEFT JOIN vsa_students s ON f.student_id = s.student_id
                LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY f.fee_month DESC, s.student_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Invoiced', 'value' => formatRupees(0), 'subtext' => '0 billed records'],
                    ['label' => 'Realized Collections', 'value' => formatRupees(0), 'subtext' => '0% realization rate'],
                    ['label' => 'Outstanding Balance', 'value' => formatRupees(0), 'subtext' => '0 unpaid dues'],
                    ['label' => 'Realization Rate', 'value' => '0%', 'subtext' => 'No active billing records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totBilled = 0;
            $totPaid = 0;
            $statusCounts = ['Paid' => 0, 'Unpaid' => 0, 'Overdue' => 0];

            foreach ($rows as $r) {
                $bld = floatval($r['fee_amount']);
                $pd  = floatval($r['paid_amount']);
                $totBilled += $bld;
                $totPaid   += $pd;

                $st = ucfirst(strtolower($r['payment_status'] ?: 'Unpaid'));
                if (isset($statusCounts[$st])) $statusCounts[$st]++;
                else $statusCounts['Unpaid']++;
            }

            $totOut = max(0, $totBilled - $totPaid);
            $realizationRate = $totBilled > 0 ? round(($totPaid / $totBilled) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Invoiced', 'value' => formatRupees($totBilled), 'subtext' => count($rows) . ' billed records'],
                ['label' => 'Realized Collections', 'value' => formatRupees($totPaid), 'subtext' => "$realizationRate% realization rate"],
                ['label' => 'Outstanding Balance', 'value' => formatRupees($totOut), 'subtext' => ($statusCounts['Unpaid'] + $statusCounts['Overdue']) . ' unpaid accounts'],
                ['label' => 'Realization Rate', 'value' => "$realizationRate%", 'subtext' => $statusCounts['Paid'] . ' fully paid records']
            ];

            $report['chart'] = [
                'type'   => 'doughnut',
                'title'  => 'Payment Status Breakdown',
                'labels' => ['Paid', 'Unpaid', 'Overdue'],
                'datasets' => [[
                    'data' => [$statusCounts['Paid'], $statusCounts['Unpaid'], $statusCounts['Overdue']],
                    'backgroundColor' => ['#22C55E', '#F59E0B', '#EF4444']
                ]]
            ];

            foreach ($rows as $r) {
                $report['table_rows'][] = [
                    date('M Y', strtotime($r['fee_month'])),
                    $r['student_name'] ?: 'Unknown Student',
                    $r['batch_name'],
                    $r['due_date'] ? date('d/m/Y', strtotime($r['due_date'])) : '—',
                    formatRupees($r['fee_amount']),
                    formatRupees($r['paid_amount']),
                    $r['payment_status'],
                    $r['payment_method'] ?: '—',
                    $r['paid_timestamp'] ? date('d/m/Y', strtotime($r['paid_timestamp'])) : '—'
                ];
            }
            break;

        case 'monthly_collection_trend':
            $report['title'] = 'Multi-Month Collection Progression Trend';
            $report['category'] = 'Fees & Payments';
            $report['period'] = 'Historical Monthly Progression';
            $report['notes'] = 'Historical financial collection performance aggregated by calendar month from vsa_student_fees.';
            $report['table_headers'] = ['Billing Month', 'Total Billed', 'Total Collected', 'Outstanding Balance', 'Collection Rate', 'Paid Accounts', 'Unpaid Accounts'];

            $sql = '
                SELECT 
                    fee_month,
                    DATE_FORMAT(fee_month, "%b %Y") AS month_label,
                    SUM(fee_amount) AS billed_amount,
                    SUM(paid_amount) AS collected_amount,
                    SUM(CASE WHEN payment_status = "Paid" THEN 1 ELSE 0 END) AS paid_cnt,
                    SUM(CASE WHEN payment_status != "Paid" THEN 1 ELSE 0 END) AS unpaid_cnt
                FROM vsa_student_fees
                WHERE fee_month IS NOT NULL
                GROUP BY fee_month, month_label
                ORDER BY fee_month ASC
            ';
            $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Invoiced (All Time)', 'value' => formatRupees(0), 'subtext' => '0 billing months'],
                    ['label' => 'Total Realized Collections', 'value' => formatRupees(0), 'subtext' => '0% collection rate'],
                    ['label' => 'Total Outstanding Exposure', 'value' => formatRupees(0), 'subtext' => '0 unpaid accounts'],
                    ['label' => 'Overall Realization Rate', 'value' => '0%', 'subtext' => 'No active billing records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $allBilled = 0;
            $allCollected = 0;
            $mLabels = [];
            $mBilled = [];
            $mCollected = [];

            foreach ($rows as $r) {
                $bld = floatval($r['billed_amount']);
                $clt = floatval($r['collected_amount']);
                $allBilled += $bld;
                $allCollected += $clt;

                $mLabels[]    = $r['month_label'];
                $mBilled[]    = $bld;
                $mCollected[] = $clt;
            }

            $allOut = max(0, $allBilled - $allCollected);
            $overallRate = $allBilled > 0 ? round(($allCollected / $allBilled) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Invoiced (All Time)', 'value' => formatRupees($allBilled), 'subtext' => count($rows) . ' billing months recorded'],
                ['label' => 'Total Realized Collections', 'value' => formatRupees($allCollected), 'subtext' => "$overallRate% collection rate"],
                ['label' => 'Total Outstanding Exposure', 'value' => formatRupees($allOut), 'subtext' => 'Cumulative dues remaining'],
                ['label' => 'Overall Realization Rate', 'value' => "$overallRate%", 'subtext' => 'Realized vs Invoiced']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Monthly Billed vs Collected Revenue',
                'labels' => $mLabels,
                'datasets' => [
                    ['label' => 'Billed (₹)',    'data' => $mBilled,    'backgroundColor' => 'rgba(201, 162, 39, 0.4)'],
                    ['label' => 'Collected (₹)', 'data' => $mCollected, 'backgroundColor' => '#22C55E']
                ]
            ];

            foreach ($rows as $r) {
                $bld = floatval($r['billed_amount']);
                $clt = floatval($r['collected_amount']);
                $out = max(0, $bld - $clt);
                $pct = $bld > 0 ? round(($clt / $bld) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $r['month_label'],
                    formatRupees($bld),
                    formatRupees($clt),
                    formatRupees($out),
                    "$pct%",
                    intval($r['paid_cnt']),
                    intval($r['unpaid_cnt'])
                ];
            }
            break;

        case 'payment_methods':
            $report['title'] = 'Payment Method Realization & Distribution';
            $report['category'] = 'Fees & Payments';
            $report['notes'] = 'Distribution of realized collections across payment channels recorded in the database.';
            $report['table_headers'] = ['Payment Method', 'Transactions / Accounts', 'Amount Realized', 'Share of Revenue'];

            $where = ['paid_amount > 0 AND payment_method IS NOT NULL AND payment_method != ""'];
            $params = [];

            if (!empty($filters['month']) && $filters['month'] !== 'all') {
                $where[] = "DATE_FORMAT(fee_month, '%Y-%m') = ?";
                $params[] = substr($filters['month'], 0, 7);
                $report['period'] = date('F Y', strtotime($filters['month'] . '-01'));
                $report['filters_applied'][] = ['label' => 'Billing Month', 'value' => $report['period']];
            }

            $sql = '
                SELECT 
                    payment_method,
                    COUNT(fee_id) AS transaction_count,
                    SUM(paid_amount) AS method_total
                FROM vsa_student_fees
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY payment_method
                ORDER BY method_total DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Realized Collections', 'value' => formatRupees(0), 'subtext' => '0 paid transactions'],
                    ['label' => 'Active Payment Channels', 'value' => 0, 'subtext' => '0 methods recorded'],
                    ['label' => 'Top Realization Channel', 'value' => 'None', 'subtext' => formatRupees(0)],
                    ['label' => 'Transaction Records', 'value' => 0, 'subtext' => 'No active payments']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totalRevenue = 0;
            $totalTx = 0;
            $pLabels = [];
            $pAmounts = [];

            foreach ($rows as $r) {
                $amt = floatval($r['method_total']);
                $totalRevenue += $amt;
                $totalTx += intval($r['transaction_count']);

                $pLabels[]  = $r['payment_method'];
                $pAmounts[] = $amt;
            }

            $topMethod = $rows[0]['payment_method'] ?? 'None';
            $topMethodAmount = floatval($rows[0]['method_total'] ?? 0);

            $report['summary_metrics'] = [
                ['label' => 'Total Realized Collections', 'value' => formatRupees($totalRevenue), 'subtext' => "$totalTx paid records"],
                ['label' => 'Active Payment Channels', 'value' => count($rows), 'subtext' => 'Payment modes utilized'],
                ['label' => 'Top Realization Channel', 'value' => $topMethod, 'subtext' => formatRupees($topMethodAmount) . ' collected'],
                ['label' => 'Transaction Records', 'value' => $totalTx, 'subtext' => 'Verified payments']
            ];

            $report['chart'] = [
                'type'   => 'pie',
                'title'  => 'Revenue Share by Payment Channel',
                'labels' => $pLabels,
                'datasets' => [[
                    'data' => $pAmounts,
                    'backgroundColor' => ['#C9A227', '#22C55E', '#38BDF8', '#F59E0B', '#A855F7']
                ]]
            ];

            foreach ($rows as $r) {
                $amt = floatval($r['method_total']);
                $share = $totalRevenue > 0 ? round(($amt / $totalRevenue) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $r['payment_method'],
                    intval($r['transaction_count']),
                    formatRupees($amt),
                    "$share%"
                ];
            }
            break;

        case 'outstanding_overdue_fees':
            $report['title'] = 'Outstanding & Overdue Fee Liabilities Audit';
            $report['category'] = 'Fees & Payments';
            $report['notes'] = 'Identifies active accounts where fee obligations remain unpaid or overdue past their specified due dates.';
            $report['table_headers'] = ['Student Name', 'Batch', 'Billing Month', 'Due Date', 'Invoiced Amount', 'Amount Paid', 'Outstanding Amount', 'Status'];

            $where = ["f.payment_status != 'Paid' AND f.fee_amount > f.paid_amount"];
            $params = [];

            if (!empty($filters['month']) && $filters['month'] !== 'all') {
                $where[] = "DATE_FORMAT(f.fee_month, '%Y-%m') = ?";
                $params[] = substr($filters['month'], 0, 7);
                $report['period'] = date('F Y', strtotime($filters['month'] . '-01'));
                $report['filters_applied'][] = ['label' => 'Billing Month', 'value' => $report['period']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'f.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }

            $sql = '
                SELECT 
                    f.fee_id,
                    f.fee_month,
                    f.due_date,
                    f.fee_amount,
                    f.paid_amount,
                    f.payment_status,
                    s.student_name,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name
                FROM vsa_student_fees f
                LEFT JOIN vsa_students s ON f.student_id = s.student_id
                LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY f.due_date ASC, f.fee_amount DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Outstanding Exposure', 'value' => formatRupees(0), 'subtext' => '0 dues outstanding'],
                    ['label' => 'Overdue Accounts', 'value' => 0, 'subtext' => '0 past due date'],
                    ['label' => 'Unpaid Accounts', 'value' => 0, 'subtext' => '0 pending payment'],
                    ['label' => 'Total Accounts With Dues', 'value' => 0, 'subtext' => 'All accounts reconciled']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totExposure = 0;
            $overdueCnt = 0;
            $unpaidCnt = 0;

            foreach ($rows as $r) {
                $bld = floatval($r['fee_amount']);
                $pd  = floatval($r['paid_amount']);
                $totExposure += max(0, $bld - $pd);

                if ($r['payment_status'] === 'Overdue') $overdueCnt++;
                else $unpaidCnt++;
            }

            $report['summary_metrics'] = [
                ['label' => 'Total Outstanding Exposure', 'value' => formatRupees($totExposure), 'subtext' => count($rows) . ' accounts with balance'],
                ['label' => 'Overdue Accounts', 'value' => $overdueCnt, 'subtext' => 'Past due date'],
                ['label' => 'Unpaid Accounts', 'value' => $unpaidCnt, 'subtext' => 'Awaiting payment'],
                ['label' => 'Total Accounts With Dues', 'value' => count($rows), 'subtext' => 'Accounts requiring follow-up']
            ];

            foreach ($rows as $r) {
                $bld = floatval($r['fee_amount']);
                $pd  = floatval($r['paid_amount']);
                $out = max(0, $bld - $pd);
                $report['table_rows'][] = [
                    $r['student_name'] ?: 'Unknown Student',
                    $r['batch_name'],
                    date('M Y', strtotime($r['fee_month'])),
                    $r['due_date'] ? date('d/m/Y', strtotime($r['due_date'])) : '—',
                    formatRupees($bld),
                    formatRupees($pd),
                    formatRupees($out),
                    $r['payment_status']
                ];
            }
            break;

        case 'student_fee_history':
            $report['title'] = 'Student Individual Fee Ledger';
            $report['category'] = 'Fees & Payments';
            $report['notes'] = 'Complete historical accounting ledger of all billing cycles and realization status for a student.';
            $report['table_headers'] = ['Billing Month', 'Student Name', 'Batch', 'Due Date', 'Fee Amount', 'Paid Amount', 'Status', 'Method', 'Paid Date'];

            $studentId = intval($filters['student_id'] ?? 0);
            $where = ['1=1'];
            $params = [];

            if ($studentId > 0) {
                $where[] = 'f.student_id = ?';
                $params[] = $studentId;

                $stStmt = $pdo->prepare('SELECT student_name FROM vsa_students WHERE student_id = ?');
                $stStmt->execute([$studentId]);
                $stRow = $stStmt->fetch();
                $stName = $stRow['student_name'] ?? "Student #$studentId";
                $report['title'] = "Student Fee Ledger: {$stName}";
                $report['filters_applied'][] = ['label' => 'Student', 'value' => $stName];
            }

            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'f.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 'f.payment_status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }

            $sql = '
                SELECT 
                    f.fee_id,
                    f.fee_month,
                    f.due_date,
                    f.fee_amount,
                    f.paid_amount,
                    f.payment_status,
                    f.payment_method,
                    f.paid_at AS paid_timestamp,
                    s.student_name,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name
                FROM vsa_student_fees f
                LEFT JOIN vsa_students s ON f.student_id = s.student_id
                LEFT JOIN vsa_batches b ON f.batch_id = b.batch_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY f.fee_month DESC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Invoiced Cycles', 'value' => 0, 'subtext' => '0 billing cycles'],
                    ['label' => 'Total Amount Paid', 'value' => formatRupees(0), 'subtext' => '0% collection rate'],
                    ['label' => 'Total Outstanding', 'value' => formatRupees(0), 'subtext' => '0 dues remaining'],
                    ['label' => 'Payment Realization Rate', 'value' => '0%', 'subtext' => 'No active billing records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totInvoiced = 0;
            $totPaid = 0;
            foreach ($rows as $r) {
                $totInvoiced += floatval($r['fee_amount']);
                $totPaid     += floatval($r['paid_amount']);
            }

            $totDues = max(0, $totInvoiced - $totPaid);
            $rate = $totInvoiced > 0 ? round(($totPaid / $totInvoiced) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Invoiced Cycles', 'value' => count($rows), 'subtext' => 'Billing cycles recorded'],
                ['label' => 'Total Amount Paid', 'value' => formatRupees($totPaid), 'subtext' => "$rate% realized"],
                ['label' => 'Total Outstanding', 'value' => formatRupees($totDues), 'subtext' => 'Current liabilities'],
                ['label' => 'Payment Realization Rate', 'value' => "$rate%", 'subtext' => 'Payment compliance']
            ];

            foreach ($rows as $r) {
                $report['table_rows'][] = [
                    date('M Y', strtotime($r['fee_month'])),
                    $r['student_name'] ?: 'Unknown Student',
                    $r['batch_name'],
                    $r['due_date'] ? date('d/m/Y', strtotime($r['due_date'])) : '—',
                    formatRupees($r['fee_amount']),
                    formatRupees($r['paid_amount']),
                    $r['payment_status'],
                    $r['payment_method'] ?: '—',
                    $r['paid_timestamp'] ? date('d/m/Y', strtotime($r['paid_timestamp'])) : '—'
                ];
            }
            break;

PHP
);

// Now write Part 6: Inventory & Management reports
fwrite($fp, <<<'PHP'
        // =====================================================================
        // F. INVENTORY REPORTS
        // =====================================================================

        case 'inventory_status':
            $report['title'] = 'Equipment Inventory Status & Capacity Utilization';
            $report['category'] = 'Inventory Reports';
            $report['period'] = 'Live Stock Registry';
            $report['notes'] = 'Inventory quantities and allocations parsed from live vsa_inventory allocations JSON.';
            $report['table_headers'] = ['Equipment Item', 'Total Quantity', 'Allocated to Batches', 'Available in Stock', 'Utilization %'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['item_id']) && $filters['item_id'] !== 'all') {
                $where[] = 'inventory_id = ?';
                $params[] = intval($filters['item_id']);
                $report['filters_applied'][] = ['label' => 'Item ID', 'value' => '#' . $filters['item_id']];
            }

            $sql = '
                SELECT 
                    inventory_id,
                    item_name,
                    total_quantity,
                    allocations
                FROM vsa_inventory
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY item_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($items)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Equipment Units', 'value' => 0, 'subtext' => '0 inventory items'],
                    ['label' => 'Allocated Units', 'value' => 0, 'subtext' => '0 in training field'],
                    ['label' => 'Available in Stock', 'value' => 0, 'subtext' => '0 in central storage'],
                    ['label' => 'Academy Equipment Utilization', 'value' => '0%', 'subtext' => '0 items tracked']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totQty = 0;
            $totAllocated = 0;
            $totAvailable = 0;
            $itemLabels = [];
            $allocData = [];
            $availData = [];

            foreach ($items as $it) {
                $t = intval($it['total_quantity']);
                $allocs = json_decode($it['allocations'] ?: '[]', true) ?: [];
                $a = 0;
                foreach ($allocs as $al) {
                    $a += intval($al['quantity'] ?? 0);
                }
                $av = max(0, $t - $a);

                $totQty += $t;
                $totAllocated += $a;
                $totAvailable += $av;

                $itemLabels[] = $it['item_name'];
                $allocData[]  = $a;
                $availData[]  = $av;
            }

            $overallUtil = $totQty > 0 ? round(($totAllocated / $totQty) * 100, 1) : 0;
            $report['summary_metrics'] = [
                ['label' => 'Total Equipment Units', 'value' => $totQty, 'subtext' => count($items) . ' equipment items'],
                ['label' => 'Allocated Units', 'value' => $totAllocated, 'subtext' => "$overallUtil% deployed in field"],
                ['label' => 'Available in Stock', 'value' => $totAvailable, 'subtext' => round(100 - $overallUtil, 1) . '% in central stock'],
                ['label' => 'Academy Equipment Utilization', 'value' => "$overallUtil%", 'subtext' => 'Asset deployment efficiency']
            ];

            $report['chart'] = [
                'type'   => 'bar',
                'title'  => 'Equipment Deployment Distribution',
                'labels' => $itemLabels,
                'datasets' => [
                    ['label' => 'Allocated Units', 'data' => $allocData, 'backgroundColor' => '#C9A227'],
                    ['label' => 'Available Stock',  'data' => $availData,  'backgroundColor' => '#22C55E']
                ]
            ];

            foreach ($items as $idx => $it) {
                $t = intval($it['total_quantity']);
                $a = $allocData[$idx];
                $av = $availData[$idx];
                $pct = $t > 0 ? round(($a / $t) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $it['item_name'],
                    $t,
                    $a,
                    $av,
                    "$pct%"
                ];
            }
            break;

        case 'inventory_allocation':
            $report['title'] = 'Batch Equipment Allocation Breakdown';
            $report['category'] = 'Inventory Reports';
            $report['period'] = 'Active Field Deployments';
            $report['notes'] = 'Active equipment allocations mapped to training batches parsed from vsa_inventory allocations JSON.';
            $report['table_headers'] = ['Batch Name', 'Batch Location', 'Assigned Coach', 'Equipment Item', 'Allocated Units'];

            $items = $pdo->query('SELECT inventory_id, item_name, allocations FROM vsa_inventory')->fetchAll(PDO::FETCH_ASSOC);

            // Fetch batches lookup
            $bStmt = $pdo->query('
                SELECT b.batch_id, b.batch_name, b.batch_location, COALESCE(c.coach_name, "Unassigned") AS coach_name
                FROM vsa_batches b
                LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
            ');
            $bLookup = [];
            while ($b = $bStmt->fetch(PDO::FETCH_ASSOC)) {
                $bLookup[intval($b['batch_id'])] = $b;
            }

            $allocRows = [];
            $batchFilterId = !empty($filters['batch_id']) && $filters['batch_id'] !== 'all' ? intval($filters['batch_id']) : 0;
            $itemFilterId  = !empty($filters['item_id']) && $filters['item_id'] !== 'all' ? intval($filters['item_id']) : 0;

            if ($batchFilterId > 0) {
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $batchFilterId];
            }
            if ($itemFilterId > 0) {
                $report['filters_applied'][] = ['label' => 'Item ID', 'value' => '#' . $itemFilterId];
            }

            foreach ($items as $it) {
                $iId = intval($it['inventory_id']);
                if ($itemFilterId > 0 && $iId !== $itemFilterId) continue;

                $allocs = json_decode($it['allocations'] ?: '[]', true) ?: [];
                foreach ($allocs as $al) {
                    $bId = intval($al['batch_id'] ?? 0);
                    if ($batchFilterId > 0 && $bId !== $batchFilterId) continue;

                    $bInfo = $bLookup[$bId] ?? [
                        'batch_name' => $al['batch_name'] ?? "Batch #$bId",
                        'batch_location' => '—',
                        'coach_name' => '—'
                    ];

                    $allocRows[] = [
                        'batch_name' => $bInfo['batch_name'],
                        'location'   => $bInfo['batch_location'] ?: '—',
                        'coach'      => $bInfo['coach_name'],
                        'item'       => $it['item_name'],
                        'qty'        => intval($al['quantity'] ?? 0)
                    ];
                }
            }

            if (empty($allocRows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Batches with Equipment', 'value' => 0, 'subtext' => '0 batches active'],
                    ['label' => 'Equipment Types Allocated', 'value' => 0, 'subtext' => '0 categories deployed'],
                    ['label' => 'Total Units in Field', 'value' => 0, 'subtext' => '0 items deployed'],
                    ['label' => 'Available Stock Remaining', 'value' => 0, 'subtext' => '0 in central storage']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $bCount = count(array_unique(array_column($allocRows, 'batch_name')));
            $iCount = count(array_unique(array_column($allocRows, 'item')));
            $totAllocUnits = array_sum(array_column($allocRows, 'qty'));

            $report['summary_metrics'] = [
                ['label' => 'Batches with Equipment', 'value' => $bCount, 'subtext' => 'Receiving allocated gear'],
                ['label' => 'Equipment Types Allocated', 'value' => $iCount, 'subtext' => 'Distinct items deployed'],
                ['label' => 'Total Units in Field', 'value' => $totAllocUnits, 'subtext' => 'Units actively in training use'],
                ['label' => 'Allocations Logged', 'value' => count($allocRows), 'subtext' => 'Specific batch allocations']
            ];

            foreach ($allocRows as $ar) {
                $report['table_rows'][] = [
                    $ar['batch_name'],
                    $ar['location'],
                    $ar['coach'],
                    $ar['item'],
                    $ar['qty']
                ];
            }
            break;

        case 'inventory_movement_audit':
            $report['title'] = 'Inventory Stock Movement & Audit Log';
            $report['category'] = 'Inventory Reports';
            $report['period'] = 'Full Historical Stock Audit';
            $report['notes'] = 'Chronological movement trail (additions, deductions, allocations, deallocations) extracted from vsa_inventory stock_history.';
            $report['table_headers'] = ['Timestamp', 'Equipment Item', 'Action Taken', 'Quantity Changed', 'Recorded Reason', 'Associated Batch'];

            $items = $pdo->query('SELECT inventory_id, item_name, stock_history FROM vsa_inventory')->fetchAll(PDO::FETCH_ASSOC);

            $movements = [];
            $itemFilterId = !empty($filters['item_id']) && $filters['item_id'] !== 'all' ? intval($filters['item_id']) : 0;
            $actionFilter = !empty($filters['action_type']) && $filters['action_type'] !== 'all' ? trim($filters['action_type']) : '';

            if ($itemFilterId > 0) {
                $report['filters_applied'][] = ['label' => 'Item ID', 'value' => '#' . $itemFilterId];
            }
            if (!empty($actionFilter)) {
                $report['filters_applied'][] = ['label' => 'Action Type', 'value' => ucfirst($actionFilter)];
            }

            foreach ($items as $it) {
                $iId = intval($it['inventory_id']);
                if ($itemFilterId > 0 && $iId !== $itemFilterId) continue;

                $hist = json_decode($it['stock_history'] ?: '[]', true) ?: [];
                foreach ($hist as $h) {
                    $act = ucfirst(strtolower($h['action'] ?? 'Unknown'));
                    if (!empty($actionFilter) && strtolower($act) !== strtolower($actionFilter)) {
                        continue;
                    }

                    $movements[] = [
                        'timestamp' => $h['timestamp'] ?? date('Y-m-d H:i:s'),
                        'item'      => $it['item_name'],
                        'action'    => $act,
                        'qty'       => intval($h['quantity'] ?? 0),
                        'reason'    => $h['reason'] ?? '—',
                        'batch'     => $h['batch_name'] ?? '—'
                    ];
                }
            }

            // Sort movements descending by timestamp
            usort($movements, function($a, $b) {
                return strcmp($b['timestamp'], $a['timestamp']);
            });

            if (empty($movements)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Audit Events', 'value' => 0, 'subtext' => '0 events logged'],
                    ['label' => 'Stock Additions Logged', 'value' => 0, 'subtext' => '0 units added'],
                    ['label' => 'Deductions Logged', 'value' => 0, 'subtext' => '0 units deducted'],
                    ['label' => 'Active Batch Allocations', 'value' => 0, 'subtext' => '0 deployment events']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $addUnits = 0;
            $dedUnits = 0;
            $allocUnits = 0;

            foreach ($movements as $m) {
                if ($m['action'] === 'Added') $addUnits += $m['qty'];
                elseif ($m['action'] === 'Deducted') $dedUnits += $m['qty'];
                elseif ($m['action'] === 'Allocated') $allocUnits += $m['qty'];
            }

            $report['summary_metrics'] = [
                ['label' => 'Total Audit Events', 'value' => count($movements), 'subtext' => 'Documented transactions'],
                ['label' => 'Stock Additions Logged', 'value' => "+{$addUnits}", 'subtext' => 'Units procured/added'],
                ['label' => 'Deductions Logged', 'value' => "-{$dedUnits}", 'subtext' => 'Damaged/lost units'],
                ['label' => 'Active Batch Allocations', 'value' => $allocUnits, 'subtext' => 'Units allocated to batches']
            ];

            foreach ($movements as $m) {
                $report['table_rows'][] = [
                    date('d/m/Y h:i A', strtotime($m['timestamp'])),
                    $m['item'],
                    $m['action'],
                    $m['qty'],
                    $m['reason'],
                    $m['batch']
                ];
            }
            break;

        case 'inventory_loss_deduction':
            $report['title'] = 'Equipment Damage, Loss & Deduction Log';
            $report['category'] = 'Inventory Reports';
            $report['period'] = 'Cumulative Loss History';
            $report['notes'] = 'Factual audit of equipment deductions filtered strictly by action: Deducted in stock_history.';
            $report['table_headers'] = ['Timestamp', 'Equipment Item', 'Units Deducted', 'Recorded Reason', 'Audited By'];

            $items = $pdo->query('SELECT inventory_id, item_name, stock_history FROM vsa_inventory')->fetchAll(PDO::FETCH_ASSOC);

            $deductions = [];
            $itemFilterId = !empty($filters['item_id']) && $filters['item_id'] !== 'all' ? intval($filters['item_id']) : 0;

            if ($itemFilterId > 0) {
                $report['filters_applied'][] = ['label' => 'Item ID', 'value' => '#' . $itemFilterId];
            }

            foreach ($items as $it) {
                $iId = intval($it['inventory_id']);
                if ($itemFilterId > 0 && $iId !== $itemFilterId) continue;

                $hist = json_decode($it['stock_history'] ?: '[]', true) ?: [];
                foreach ($hist as $h) {
                    if (strtolower($h['action'] ?? '') === 'deducted') {
                        $deductions[] = [
                            'timestamp' => $h['timestamp'] ?? date('Y-m-d H:i:s'),
                            'item'      => $it['item_name'],
                            'qty'       => intval($h['quantity'] ?? 0),
                            'reason'    => $h['reason'] ?? 'Damaged / Worn Out',
                            'audited'   => $h['admin'] ?? 'Super Admin'
                        ];
                    }
                }
            }

            usort($deductions, function($a, $b) {
                return strcmp($b['timestamp'], $a['timestamp']);
            });

            if (empty($deductions)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Deducted Units', 'value' => 0, 'subtext' => '0 loss events logged'],
                    ['label' => 'Deduction Audit Events', 'value' => 0, 'subtext' => '0 entries recorded'],
                    ['label' => 'Equipment Items Affected', 'value' => 0, 'subtext' => '0 equipment items'],
                    ['label' => 'Most Common Reason', 'value' => 'None', 'subtext' => 'No active deductions']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totDedUnits = array_sum(array_column($deductions, 'qty'));
            $distinctItems = count(array_unique(array_column($deductions, 'item')));

            $report['summary_metrics'] = [
                ['label' => 'Total Deducted Units', 'value' => $totDedUnits, 'subtext' => 'Units written off'],
                ['label' => 'Deduction Audit Events', 'value' => count($deductions), 'subtext' => 'Recorded incidents'],
                ['label' => 'Equipment Items Affected', 'value' => $distinctItems, 'subtext' => 'Categories with losses'],
                ['label' => 'Audited Classification', 'value' => 'Verified', 'subtext' => 'Administrative write-offs']
            ];

            foreach ($deductions as $d) {
                $report['table_rows'][] = [
                    date('d/m/Y h:i A', strtotime($d['timestamp'])),
                    $d['item'],
                    $d['qty'],
                    $d['reason'],
                    $d['audited']
                ];
            }
            break;

        // =====================================================================
        // G. MANAGEMENT REPORTS
        // =====================================================================

        case 'academy_operational_summary':
            $report['title'] = 'Academy Cross-Functional Operational Summary';
            $report['category'] = 'Management Reports';
            $report['notes'] = 'Executive overview synthesizing student rosters, attendance roll-calls, fee collections, and equipment deployments.';
            $report['table_headers'] = ['Operational Domain', 'Key Metric', 'Recorded Value', 'Operational Summary'];

            $whereFee = ['1=1'];
            $whereAtt = ['1=1'];
            $paramsFee = [];
            $paramsAtt = [];

            if (!empty($filters['month']) && $filters['month'] !== 'all') {
                $whereFee[] = "DATE_FORMAT(fee_month, '%Y-%m') = ?";
                $paramsFee[] = substr($filters['month'], 0, 7);
                $whereAtt[] = "DATE_FORMAT(attendance_date, '%Y-%m') = ?";
                $paramsAtt[] = substr($filters['month'], 0, 7);
                $report['period'] = date('F Y', strtotime($filters['month'] . '-01'));
                $report['filters_applied'][] = ['label' => 'Operating Month', 'value' => $report['period']];
            }

            // 1. Students
            $totStudents = intval($pdo->query('SELECT COUNT(*) FROM vsa_students WHERE status = "Active"')->fetchColumn());
            $totBatches  = intval($pdo->query('SELECT COUNT(*) FROM vsa_batches WHERE status = "Active"')->fetchColumn());

            // 2. Attendance
            $attSql = '
                SELECT 
                    COUNT(DISTINCT CONCAT(attendance_date, "-", batch_id)) AS sessions_held,
                    COUNT(attendance_id) AS total_records,
                    SUM(CASE WHEN status = "Present" THEN 1 ELSE 0 END) AS present_count
                FROM vsa_attendance
                WHERE ' . implode(' AND ', $whereAtt) . '
            ';
            $attStmt = $pdo->prepare($attSql);
            $attStmt->execute($paramsAtt);
            $att = $attStmt->fetch(PDO::FETCH_ASSOC);
            $sessHeld = intval($att['sessions_held'] ?? 0);
            $attCalls = intval($att['total_records'] ?? 0);
            $attPres  = intval($att['present_count'] ?? 0);
            $attRate  = $attCalls > 0 ? round(($attPres / $attCalls) * 100, 1) : 0;

            // 3. Fees
            $feeSql = '
                SELECT 
                    SUM(fee_amount) AS total_billed,
                    SUM(paid_amount) AS total_collected
                FROM vsa_student_fees
                WHERE ' . implode(' AND ', $whereFee) . '
            ';
            $feeStmt = $pdo->prepare($feeSql);
            $feeStmt->execute($paramsFee);
            $fee = $feeStmt->fetch(PDO::FETCH_ASSOC);
            $billed    = floatval($fee['total_billed'] ?? 0);
            $collected = floatval($fee['total_collected'] ?? 0);
            $feeRate   = $billed > 0 ? round(($collected / $billed) * 100, 1) : 0;

            // 4. Inventory
            $invItems = $pdo->query('SELECT allocations FROM vsa_inventory')->fetchAll(PDO::FETCH_ASSOC);
            $invAlloc = 0;
            foreach ($invItems as $inv) {
                $als = json_decode($inv['allocations'] ?: '[]', true) ?: [];
                foreach ($als as $al) $invAlloc += intval($al['quantity'] ?? 0);
            }

            $report['summary_metrics'] = [
                ['label' => 'Active Enrolled Athletes', 'value' => $totStudents, 'subtext' => "$totBatches active batches"],
                ['label' => 'Sessions Conducted', 'value' => $sessHeld, 'subtext' => "$attRate% attendance rate ($attPres presences)"],
                ['label' => 'Realized Collections', 'value' => formatRupees($collected), 'subtext' => "$feeRate% collection rate (of " . formatRupees($billed) . ")"],
                ['label' => 'Equipment In Field', 'value' => $invAlloc, 'subtext' => 'Units deployed across batches']
            ];

            $report['table_rows'] = [
                ['Student Roster', 'Active Enrolled Athletes', $totStudents . ' Athletes', 'Athletes enrolled in current academy database'],
                ['Training Operations', 'Active Training Batches', $totBatches . ' Batches', 'Operating batches across academy locations'],
                ['Session Attendance', 'Sessions Conducted', $sessHeld . ' Sessions', "$attCalls roll-calls logged ($attRate% presence rate)"],
                ['Financial Billing', 'Total Invoiced Liabilities', formatRupees($billed), 'Gross fee obligations for evaluated period'],
                ['Financial Collections', 'Total Realized Collections', formatRupees($collected), "$feeRate% revenue realization efficiency"],
                ['Equipment Operations', 'Equipment Deployed in Field', $invAlloc . ' Units', 'Total equipment units allocated to active batches']
            ];
            break;

        case 'monthly_academy_report':
            $report['title'] = 'Monthly Formal Academy Performance Report';
            $report['category'] = 'Management Reports';
            $report['notes'] = 'Executive month-end performance review combining roster headcounts, attendance adherence, and financial cash realization.';
            $report['table_headers'] = ['Performance Area', 'Indicator', 'Monthly Result', 'Executive Summary'];

            $selectedMonth = !empty($filters['month']) && $filters['month'] !== 'all' ? substr($filters['month'], 0, 7) : date('Y-m');
            $report['period'] = date('F Y', strtotime($selectedMonth . '-01'));
            $report['filters_applied'][] = ['label' => 'Reporting Month', 'value' => $report['period']];

            // 1. Students
            $totStudents = intval($pdo->query('SELECT COUNT(*) FROM vsa_students WHERE status = "Active"')->fetchColumn());

            // 2. Attendance in month
            $attStmt = $pdo->prepare('
                SELECT 
                    COUNT(attendance_id) AS total_records,
                    SUM(CASE WHEN status = "Present" THEN 1 ELSE 0 END) AS present_count
                FROM vsa_attendance
                WHERE DATE_FORMAT(attendance_date, "%Y-%m") = ?
            ');
            $attStmt->execute([$selectedMonth]);
            $att = $attStmt->fetch(PDO::FETCH_ASSOC);
            $attCalls = intval($att['total_records'] ?? 0);
            $attPres  = intval($att['present_count'] ?? 0);
            $attRate  = $attCalls > 0 ? round(($attPres / $attCalls) * 100, 1) : 0;

            // 3. Fees in month
            $feeStmt = $pdo->prepare('
                SELECT 
                    COUNT(fee_id) AS total_obligations,
                    SUM(fee_amount) AS billed_amount,
                    SUM(paid_amount) AS collected_amount,
                    SUM(CASE WHEN payment_status = "Paid" THEN 1 ELSE 0 END) AS paid_count,
                    SUM(CASE WHEN payment_status = "Overdue" THEN 1 ELSE 0 END) AS overdue_count
                FROM vsa_student_fees
                WHERE DATE_FORMAT(fee_month, "%Y-%m") = ?
            ');
            $feeStmt->execute([$selectedMonth]);
            $fee = $feeStmt->fetch(PDO::FETCH_ASSOC);
            $billed    = floatval($fee['billed_amount'] ?? 0);
            $collected = floatval($fee['collected_amount'] ?? 0);
            $paidCnt   = intval($fee['paid_count'] ?? 0);
            $dueCnt    = intval($fee['overdue_count'] ?? 0);
            $feeRate   = $billed > 0 ? round(($collected / $billed) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Active Athletes', 'value' => $totStudents, 'subtext' => 'In training roster'],
                ['label' => 'Month Attendance %', 'value' => "$attRate%", 'subtext' => "$attPres presences of $attCalls"],
                ['label' => 'Billed Revenue', 'value' => formatRupees($billed), 'subtext' => intval($fee['total_obligations'] ?? 0) . ' billed athlete accounts'],
                ['label' => 'Collected Revenue', 'value' => formatRupees($collected), 'subtext' => "$feeRate% realized ($paidCnt paid)"]
            ];

            $report['table_rows'] = [
                ['Athletes & Roster', 'Active Student Enrollment', $totStudents . ' Athletes', 'Roster capacity operating stably'],
                ['Training Attendance', 'Session Roll-Calls Logged', $attCalls . ' Roll-Calls', "$attPres attendances recorded ($attRate% rate)"],
                ['Financial Billing', 'Total Invoiced Obligations', formatRupees($billed), intval($fee['total_obligations'] ?? 0) . ' accounts billed'],
                ['Financial Realization', 'Realized Fee Collections', formatRupees($collected), "$feeRate% collection rate ($paidCnt accounts fully paid)"],
                ['Outstanding Exposure', 'Uncollected / Overdue Funds', formatRupees(max(0, $billed - $collected)), "$dueCnt accounts currently marked overdue"]
            ];
            break;

        default:
            throw new Exception("Unknown report type requested: {$reportType}");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FINAL NORMALIZATION (Shared between Preview and PDF)
    // ─────────────────────────────────────────────────────────────────────────
    $report['reporting_period'] = $report['period'];
    $report['generated_date']   = date('d F Y');
    $report['generated_time']   = date('h:i A');

    if (is_string($report['notes'])) {
        $report['notes'] = array_values(array_filter(array_map('trim', explode("\n", $report['notes']))));
        if (empty($report['notes'])) {
            $report['notes'] = ['Authoritative records compiled directly from the live VAVA database.'];
        }
    }

    // Construct table.columns and table.rows for frontend
    $columns = [];
    foreach ($report['table_headers'] as $cIdx => $th) {
        $columns[] = ['key' => 'col_' . $cIdx, 'label' => $th];
    }
    $rows = [];
    foreach ($report['table_rows'] as $rIdx => $row) {
        $rowObj = [];
        foreach ($columns as $cIdx => $col) {
            $rowObj[$col['key']] = $row[$cIdx] ?? '';
        }
        $rows[] = $rowObj;
    }
    $report['table'] = [
        'columns' => $columns,
        'rows'    => $rows
    ];

    // Structure chart for Chart.js
    if (!empty($report['chart']) && !isset($report['chart']['data'])) {
        $report['chart']['data'] = [
            'labels'   => $report['chart']['labels'] ?? [],
            'datasets' => $report['chart']['datasets'] ?? []
        ];
    }

    return $report;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SERVER-SIDE PDF RENDERER (Professional A4 Document via Dompdf)
// ─────────────────────────────────────────────────────────────────────────────

function generateReportPdf($reportData, $chartImageBase64 = null) {
    if (!class_exists('Dompdf\Dompdf')) {
        throw new Exception('Dompdf library is not installed or available on this system.');
    }

    $title = htmlspecialchars($reportData['title'] ?? '');
    $category = htmlspecialchars($reportData['category'] ?? '');
    $period = htmlspecialchars($reportData['period'] ?? ($reportData['reporting_period'] ?? ''));
    $generatedAt = htmlspecialchars($reportData['generated_at'] ?? '');
    $rawNotes = $reportData['notes'] ?? '';
    $notes = htmlspecialchars(is_array($rawNotes) ? implode(' ', $rawNotes) : (string)$rawNotes);

    // Render filters
    $filtersHtml = '';
    if (!empty($reportData['filters_applied'])) {
        $filterParts = [];
        foreach ($reportData['filters_applied'] as $fa) {
            $filterParts[] = htmlspecialchars($fa['label']) . ': <strong>' . htmlspecialchars($fa['value']) . '</strong>';
        }
        $filtersHtml = implode('&nbsp;&nbsp;|&nbsp;&nbsp;', $filterParts);
    } else {
        $filtersHtml = '<em>No filters applied (Academy-wide scope)</em>';
    }

    // Render summary metrics cards
    $metricsHtml = '<table class="kpi-grid"><tr>';
    $colCount = count($reportData['summary_metrics'] ?? []);
    $colWidth = $colCount > 0 ? (100 / $colCount) : 25;
    foreach (($reportData['summary_metrics'] ?? []) as $m) {
        $lbl = htmlspecialchars($m['label'] ?? '');
        $val = htmlspecialchars($m['value'] ?? '');
        $sub = htmlspecialchars($m['subtext'] ?? '');
        $metricsHtml .= "
            <td style=\"width: {$colWidth}%;\">
                <div class=\"kpi-box\">
                    <div class=\"kpi-label\">{$lbl}</div>
                    <div class=\"kpi-value\">{$val}</div>
                    <div class=\"kpi-sub\">{$sub}</div>
                </div>
            </td>
        ";
    }
    $metricsHtml .= '</tr></table>';

    // Render Chart image if supplied from client canvas
    $chartHtml = '';
    if (!empty($chartImageBase64) && strpos($chartImageBase64, 'data:image') === 0) {
        $chartHtml = "
            <div class=\"section-title\">VISUAL ANALYTICS & DISTRIBUTION</div>
            <div class=\"chart-wrap\">
                <img src=\"{$chartImageBase64}\" class=\"chart-img\" alt=\"Report Chart\">
            </div>
        ";
    }

    // Render Data Table
    $tableHtml = '';
    if (!empty($reportData['table_headers']) && !empty($reportData['table_rows'])) {
        $tableHtml .= '<table class="data-table"><thead><tr>';
        foreach ($reportData['table_headers'] as $th) {
            $tableHtml .= '<th>' . htmlspecialchars($th) . '</th>';
        }
        $tableHtml .= '</tr></thead><tbody>';

        foreach ($reportData['table_rows'] as $idx => $row) {
            $rowClass = ($idx % 2 === 1) ? ' class="alt-row"' : '';
            $tableHtml .= "<tr{$rowClass}>";
            foreach ($row as $cell) {
                $tableHtml .= '<td>' . htmlspecialchars($cell) . '</td>';
            }
            $tableHtml .= '</tr>';
        }
        $tableHtml .= '</tbody></table>';
    } else {
        $tableHtml = '<div class="empty-box">No records matched the selected filters.</div>';
    }

    // Decide orientation (wide tables with > 6 columns benefit from landscape)
    $orientation = (count($reportData['table_headers'] ?? []) >= 7) ? 'landscape' : 'portrait';

    $html = <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{$title}</title>
<style>
    @page {
        margin: 28px 32px 36px 32px;
    }
    body {
        font-family: 'Helvetica', 'Arial', sans-serif;
        color: #1F2937;
        font-size: 9px;
        line-height: 1.35;
        margin: 0;
        padding: 0;
    }
    .header-table {
        width: 100%;
        border-bottom: 2px solid #C9A227;
        padding-bottom: 8px;
        margin-bottom: 12px;
    }
    .brand-title {
        font-size: 16px;
        font-weight: bold;
        color: #090B0D;
        letter-spacing: 0.5px;
    }
    .brand-sub {
        font-size: 8px;
        color: #6B7280;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-top: 1px;
    }
    .report-title {
        font-size: 13px;
        font-weight: bold;
        color: #8C6814;
        margin-top: 4px;
    }
    .meta-box {
        text-align: right;
        font-size: 8.5px;
        color: #4B5563;
        line-height: 1.35;
    }
    .meta-box strong {
        color: #111827;
    }
    .filters-bar {
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 4px;
        padding: 6px 10px;
        margin-bottom: 12px;
        font-size: 8.5px;
        color: #374151;
    }
    .section-title {
        font-size: 9px;
        font-weight: bold;
        color: #374151;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        margin: 12px 0 6px 0;
        border-left: 3px solid #C9A227;
        padding-left: 6px;
    }
    .kpi-grid {
        width: 100%;
        border-collapse: separate;
        border-spacing: 6px 0;
        margin-left: -6px;
        margin-right: -6px;
        margin-bottom: 12px;
    }
    .kpi-box {
        background: #FAFAFA;
        border: 1px solid #E5E7EB;
        border-top: 2px solid #C9A227;
        border-radius: 4px;
        padding: 8px 10px;
        text-align: left;
    }
    .kpi-label {
        font-size: 7.5px;
        color: #6B7280;
        text-transform: uppercase;
        font-weight: bold;
        letter-spacing: 0.4px;
        margin-bottom: 3px;
    }
    .kpi-value {
        font-size: 14px;
        font-weight: bold;
        color: #111827;
        margin-bottom: 2px;
    }
    .kpi-sub {
        font-size: 7.5px;
        color: #4B5563;
    }
    .chart-wrap {
        text-align: center;
        margin-bottom: 14px;
        padding: 8px;
        background: #FAFAFA;
        border: 1px solid #E5E7EB;
        border-radius: 4px;
    }
    .chart-img {
        max-width: 95%;
        max-height: 180px;
    }
    .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
        margin-bottom: 14px;
    }
    .data-table th {
        background: #F3F4F6;
        color: #111827;
        font-weight: bold;
        font-size: 8px;
        padding: 5px 6px;
        text-align: left;
        border: 1px solid #D1D5DB;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }
    .data-table td {
        padding: 5px 6px;
        border: 1px solid #E5E7EB;
        font-size: 8px;
    }
    .data-table tr.alt-row {
        background: #F9FAFB;
    }
    .notes-box {
        background: #FFFBEB;
        border: 1px solid #FDE68A;
        border-radius: 4px;
        padding: 7px 10px;
        font-size: 8px;
        color: #92400E;
        line-height: 1.4;
        margin-top: 10px;
        margin-bottom: 14px;
    }
    .empty-box {
        background: #F9FAFB;
        border: 1px dashed #D1D5DB;
        border-radius: 4px;
        padding: 18px;
        text-align: center;
        color: #6B7280;
        font-size: 9px;
        margin: 10px 0;
    }
    .footer-table {
        width: 100%;
        border-top: 1px solid #E5E7EB;
        padding-top: 8px;
        margin-top: 14px;
        font-size: 7.5px;
        color: #9CA3AF;
    }
</style>
</head>
<body>

<!-- Header -->
<table class="header-table">
    <tr>
        <td style="width: 55%;">
            <div class="brand-title">VAVA SPORTS ACADEMY</div>
            <div class="brand-sub">Management Information & Operations System</div>
            <div class="report-title">{$title}</div>
        </td>
        <td style="width: 45%;" class="meta-box">
            <div>Reporting Period: <strong>{$period}</strong></div>
            <div>Generated: <strong>{$generatedAt}</strong></div>
            <div>Classification: <strong>Official Administrative Document</strong></div>
        </td>
    </tr>
</table>

<!-- Applied Filters -->
<div class="filters-bar">
    Applied Filters: {$filtersHtml}
</div>

<!-- Executive Summary KPIs -->
<div class="section-title">EXECUTIVE SUMMARY METRICS</div>
{$metricsHtml}

<!-- Visual Chart if provided -->
{$chartHtml}

<!-- Detailed Data Section -->
<div class="section-title">DETAILED RECORDS BREAKDOWN</div>
{$tableHtml}

HTML;

    if (!empty($notes)) {
        $html .= "<div class=\"notes-box\"><strong>Data Methodology Note:</strong> {$notes}</div>";
    }

    $html .= <<<HTML
<!-- Footer -->
<table class="footer-table">
    <tr>
        <td style="text-align:left;">
            VAVA Sports Academy • Confidential Administration Report
        </td>
        <td style="text-align:right;">
            Generated on {$generatedAt} IST
        </td>
    </tr>
</table>

</body>
</html>
HTML;

    $dompdf = new Dompdf\Dompdf([
        'isHtml5ParserEnabled' => true,
        'isRemoteEnabled'      => true,
        'defaultFont'          => 'Helvetica'
    ]);
    $dompdf->setPaper('A4', $orientation);
    $dompdf->loadHtml($html);
    $dompdf->render();

    return $dompdf->output();
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MAIN REQUEST DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? 'get_filter_options';

// If POST body is JSON, extract fields
$postData = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $postData = json_decode($raw, true) ?: $_POST;
    if (isset($postData['action'])) {
        $action = $postData['action'];
    }
}

$auth = resolveReportsUser($pdo, $postData);

try {
    // ── ACTION 1: Get Filter Options ─────────────────────────────────────────
    if ($action === 'get_filter_options' || $action === 'filter_options') {
        $options = getFilterOptions($pdo, $auth);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => true,
            'status'  => 'success',
            'role'    => $auth['role'],
            'data'    => $options,
            'options' => $options
        ]);
        exit;
    }

    // ── ACTION 2: Get Structured Report Data (Preview) ────────────────────────
    if ($action === 'get_report' || $action === 'report_data') {
        $reportType = trim($_GET['report'] ?? ($postData['report'] ?? ''));
        if (empty($reportType)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => false,
                'status'  => 'error',
                'error'   => 'Report type parameter (report) is required.',
                'message' => 'Report type parameter (report) is required.'
            ]);
            exit;
        }

        $filters = array_merge($_GET, $postData);
        $reportData = getReportData($pdo, $reportType, $filters, $auth);

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => true,
            'status'  => 'success',
            'data'    => $reportData,
            'report'  => $reportData
        ]);
        exit;
    }

    // ── ACTION 3: Download Formatted A4 PDF ───────────────────────────────────
    if ($action === 'download_pdf') {
        $reportType = trim($_GET['report'] ?? ($postData['report'] ?? ''));
        if (empty($reportType)) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => false,
                'status'  => 'error',
                'error'   => 'Report type parameter (report) is required.'
            ]);
            exit;
        }

        $filters = array_merge($_GET, $postData);
        $chartImage = $postData['chart_image'] ?? ($_GET['chart_image'] ?? null);

        $reportData = getReportData($pdo, $reportType, $filters, $auth);
        $pdfOutput = generateReportPdf($reportData, $chartImage);

        // Sanitize filename
        $cleanTitle = preg_replace('/[^A-Za-z0-9_]/', '_', $reportData['title']);
        $filename = 'VAVA_' . $cleanTitle . '_' . date('Y-m-d') . '.pdf';

        if (ob_get_length()) ob_end_clean(); // Clean any previous buffer

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($pdfOutput));
        header('Cache-Control: private, max-age=0, must-revalidate');
        header('Pragma: public');
        echo $pdfOutput;
        exit;
    }

    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'status'  => 'error',
        'error'   => "Invalid action requested: {$action}"
    ]);

} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'status'  => 'error',
        'error'   => $e->getMessage()
    ]);
    exit;
}
PHP
);

fclose($fp);
echo "server/reports.php has been completely generated!\n";
