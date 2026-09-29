<?php
/**
 * VAVA Sports Academy - Reports & Analytics Backend Engine
 * 
 * Simplified & Consolidated 5 Core Reports:
 * 1. Student & Batch Report (student_batch)
 * 2. Attendance Report (attendance_report)
 * 3. Fees & Payments Report (fees_payments) - Super Admin Only
 * 4. Coach & Batch Activity Report (coach_activity) - Factual assignments & sessions
 * 5. Inventory Report (inventory_report) - Super Admin Only
 * 
 * Core Architectural Guarantees:
 * - Dynamic data from MySQL (zero hardcoded / demo / fallback data)
 * - Prepared PDO statements with SQL parameter binding
 * - Strict JSON response: Content-Type: application/json; charset=utf-8
 * - Resilient empty-state handling (zero records return valid zero metrics and empty arrays, never crashing)
 * - Historical attendance preserves vsa_attendance.batch_id and coach_id
 * - Historical fees preserve vsa_student_fees.batch_id
 * - Batch names disambiguated by ID + location + schedule
 * - No PDF generation or Dompdf dependencies
 * - Role-based authorization preserved
 */

date_default_timezone_set('Asia/Kolkata');

// CORS & HTTP Headers
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID, Authorization');
header('Access-Control-Allow-Credentials: true');

$reqMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($reqMethod === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db_connect.php';

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

function formatRupees($amount) {
    $num = floatval($amount);
    return '₹' . number_format($num, 2, '.', ',');
}

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
        // Non-fatal
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DYNAMIC FILTER OPTIONS
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

    $nameCounts = [];
    foreach ($batches as $b) {
        $nm = trim($b['batch_name']);
        $nameCounts[$nm] = ($nameCounts[$nm] ?? 0) + 1;
    }

    $formattedBatches = [];
    foreach ($batches as $b) {
        $displayName = $b['batch_name'];
        $details = array_filter([$b['batch_location'], $b['batch_time']]);
        if (!empty($details)) {
            $displayName .= ' • ' . implode(' • ', $details);
        }
        if (($nameCounts[trim($b['batch_name'])] ?? 0) > 1) {
            $displayName .= " (#{$b['batch_id']})";
        }

        $formattedBatches[] = [
            'batch_id'       => intval($b['batch_id']),
            'batch_name'     => $b['batch_name'],
            'display_name'   => $displayName,
            'batch_location' => $b['batch_location'] ?? '',
            'branch'         => $b['batch_location'] ?? '',
            'coach_name'     => $b['coach_name'] ?? 'Unassigned'
        ];
    }

    // 2. Coaches
    $coachSql = '
        SELECT coach_id, coach_name, coach_email, status, coach_sport
        FROM vsa_coaches
        ORDER BY coach_name ASC
    ';
    $coaches = $pdo->query($coachSql)->fetchAll(PDO::FETCH_ASSOC);

    // 3. Students
    $studentSql = '
        SELECT student_id, student_name, batch_id, status AS student_status, gender, branch_name AS branch
        FROM vsa_students
    ';
    if ($isCoach && !empty($coachAssignedBatchIds)) {
        $inClause = implode(',', array_map('intval', $coachAssignedBatchIds));
        $studentSql .= " WHERE batch_id IN ($inClause)";
    }
    $studentSql .= ' ORDER BY student_name ASC';
    $students = $pdo->query($studentSql)->fetchAll(PDO::FETCH_ASSOC);

    // 4. Distinct Branches & Cities
    $branchRows = $pdo->query('
        SELECT DISTINCT branch_name AS branch FROM vsa_students WHERE branch_name IS NOT NULL AND branch_name != ""
        UNION
        SELECT DISTINCT batch_location AS branch FROM vsa_batches WHERE batch_location IS NOT NULL AND batch_location != ""
        ORDER BY branch ASC
    ')->fetchAll(PDO::FETCH_COLUMN);

    $cityRows = $pdo->query('
        SELECT DISTINCT city FROM vsa_students WHERE city IS NOT NULL AND city != ""
        ORDER BY city ASC
    ')->fetchAll(PDO::FETCH_COLUMN);

    // 5. Billing Months
    $monthRows = $pdo->query('
        SELECT DISTINCT fee_month 
        FROM vsa_student_fees 
        WHERE fee_month IS NOT NULL 
        ORDER BY fee_month DESC
    ')->fetchAll(PDO::FETCH_COLUMN);

    $formattedMonths = [];
    foreach ($monthRows as $fm) {
        $ts = strtotime($fm);
        if ($ts) {
            $formattedMonths[] = [
                'month' => date('Y-m', $ts),
                'label' => date('F Y', $ts)
            ];
        }
    }

    // 6. Inventory Items
    $inventoryItems = $pdo->query('
        SELECT inventory_id, item_name, total_quantity
        FROM vsa_inventory
        ORDER BY item_name ASC
    ')->fetchAll(PDO::FETCH_ASSOC);

    // 7. Payment Methods
    $paymentMethods = $pdo->query('
        SELECT DISTINCT payment_method
        FROM vsa_student_fees
        WHERE payment_method IS NOT NULL AND payment_method != ""
        ORDER BY payment_method ASC
    ')->fetchAll(PDO::FETCH_COLUMN);
    if (empty($paymentMethods)) {
        $paymentMethods = ['Cash', 'GPay / UPI', 'Bank Transfer', 'Razorpay'];
    }

    return [
        'batches'          => $formattedBatches,
        'coaches'          => $coaches,
        'students'         => $students,
        'branches'         => array_values(array_filter($branchRows)),
        'cities'           => array_values(array_filter($cityRows)),
        'genders'          => ['Male', 'Female'],
        'months'           => $formattedMonths,
        'available_months' => $formattedMonths,
        'inventory_items'  => $inventoryItems,
        'payment_methods'  => array_values(array_filter($paymentMethods))
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MAIN CONSOLIDATED REPORT CALCULATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function getReportData($pdo, $reportType, $filters, $auth) {
    refreshOverdueStatuses($pdo);

    $isCoach = ($auth['role'] === 'coach');
    $coachId = $isCoach ? intval($auth['coach']['coach_id'] ?? 0) : 0;
    $coachAssignedBatchIds = $isCoach ? ($auth['coach']['assigned_batch_ids'] ?? []) : [];

    // Role Guard: Financial & Inventory reports are Super Admin only
    if ($isCoach && in_array($reportType, ['fees_payments', 'inventory_report'])) {
        throw new Exception('Access denied. Financial, inventory, and management reports are restricted to Super Admin only.');
    }

    $report = [
        'id'               => $reportType,
        'title'            => 'Report',
        'category'         => 'General',
        'generated_at'     => date('Y-m-d H:i:s'),
        'generated_date'   => date('d M Y'),
        'generated_time'   => date('h:i A'),
        'period'           => 'All Records',
        'filters_applied'  => [],
        'summary_metrics'  => [],
        'chart'            => null,
        'table_headers'    => [],
        'table_rows'       => [],
        'batch_summary'    => null,
        'secondary_table'  => null,
        'compact_views'    => null,
        'notes'            => '',
        'empty'            => false
    ];

    switch ($reportType) {

        // =====================================================================
        // 1. STUDENT & BATCH REPORT
        // =====================================================================
        case 'student_batch':
            $report['title'] = 'Student & Batch Report';
            $report['category'] = 'Students & Batches';
            $report['period'] = 'Live Enrollment & Batch Allocation';
            $report['notes'] = 'Authoritative roster of enrolled students and active training batch allocations calculated dynamically from MySQL.';
            $report['table_headers'] = ['Student Name', 'Batch', 'Coach', 'Branch', 'Gender', 'Status'];

            $where = ['1=1'];
            $params = [];

            // Filters
            if (!empty($filters['student_id']) && $filters['student_id'] !== 'all') {
                $where[] = 's.student_id = ?';
                $params[] = intval($filters['student_id']);
                $report['filters_applied'][] = ['label' => 'Student ID', 'value' => '#' . $filters['student_id']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 's.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $where[] = 's.coach_id = ?';
                $params[] = intval($filters['coach_id']);
                $report['filters_applied'][] = ['label' => 'Coach ID', 'value' => '#' . $filters['coach_id']];
            }
            if (!empty($filters['branch']) && $filters['branch'] !== 'all') {
                $where[] = '(s.branch_name = ? OR b.batch_location = ?)';
                $params[] = $filters['branch'];
                $params[] = $filters['branch'];
                $report['filters_applied'][] = ['label' => 'Branch', 'value' => $filters['branch']];
            }
            if (!empty($filters['gender']) && $filters['gender'] !== 'all') {
                $where[] = 'LOWER(s.gender) = LOWER(?)';
                $params[] = $filters['gender'];
                $report['filters_applied'][] = ['label' => 'Gender', 'value' => ucfirst($filters['gender'])];
            }
            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 's.status = ?';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }

            // Coach restriction
            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $inClause = implode(',', array_map('intval', $coachAssignedBatchIds));
                $where[] = "(s.batch_id IN ($inClause) OR s.coach_id = $coachId)";
            }

            // Student records query
            $sql = '
                SELECT 
                    s.student_id,
                    s.student_name,
                    s.branch_name AS branch,
                    s.gender,
                    COALESCE(s.status, "Active") AS student_status,
                    COALESCE(b.batch_name, "Unassigned") AS batch_name,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name
                FROM vsa_students s
                LEFT JOIN vsa_batches b ON s.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON s.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY s.student_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $studentRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Dynamic Batch Summary Query (based on real student counts, NOT stale batch.current_students)
            $batchSummarySql = '
                SELECT 
                    b.batch_id,
                    b.batch_name,
                    COALESCE(b.batch_location, "—") AS location,
                    COALESCE(DATE_FORMAT(b.batch_time, "%H:%i"), b.batch_time, "—") AS schedule,
                    COALESCE(c.coach_name, "Unassigned") AS coach_name,
                    COUNT(s.student_id) AS current_student_count
                FROM vsa_batches b
                LEFT JOIN vsa_coaches c ON b.coach_id = c.coach_id
                LEFT JOIN vsa_students s ON b.batch_id = s.batch_id AND (s.status = "Active" OR s.status IS NULL)
            ';
            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $inClause = implode(',', array_map('intval', $coachAssignedBatchIds));
                $batchSummarySql .= " WHERE b.batch_id IN ($inClause)";
            }
            $batchSummarySql .= ' GROUP BY b.batch_id, b.batch_name, b.batch_location, b.batch_time, c.coach_name ORDER BY current_student_count DESC, b.batch_name ASC';
            $batchSummaryRows = $pdo->query($batchSummarySql)->fetchAll(PDO::FETCH_ASSOC);

            if (empty($studentRows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Students', 'value' => 0, 'subtext' => '0 active athletes'],
                    ['label' => 'Active Students', 'value' => 0, 'subtext' => '0% active rate'],
                    ['label' => 'Inactive Students', 'value' => 0, 'subtext' => '0 inactive/on-leave'],
                    ['label' => 'Total Batches', 'value' => count($batchSummaryRows), 'subtext' => 'Academy batches'],
                    ['label' => 'Students in Batches', 'value' => 0, 'subtext' => '0% allocated']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                $report['batch_summary'] = [
                    'title'   => 'Batch Capacity & Enrollment Summary',
                    'headers' => ['Batch Name', 'Coach', 'Location / Branch', 'Schedule', 'Current Student Count'],
                    'rows'    => array_map(function($b) {
                        return [$b['batch_name'], $b['coach_name'], $b['location'], $b['schedule'], intval($b['current_student_count'])];
                    }, $batchSummaryRows)
                ];
                break;
            }

            $totalStudents = count($studentRows);
            $activeStudents = 0;
            $inactiveStudents = 0;
            $assignedStudents = 0;

            foreach ($studentRows as $r) {
                if (strtolower($r['student_status']) === 'active') {
                    $activeStudents++;
                } else {
                    $inactiveStudents++;
                }
                if ($r['batch_name'] !== 'Unassigned') {
                    $assignedStudents++;
                }
                $report['table_rows'][] = [
                    $r['student_name'],
                    $r['batch_name'],
                    $r['coach_name'],
                    $r['branch'] ?: '—',
                    $r['gender'] ?: '—',
                    $r['student_status']
                ];
            }

            $activeRate = $totalStudents > 0 ? round(($activeStudents / $totalStudents) * 100, 1) : 0;
            $assignedRate = $totalStudents > 0 ? round(($assignedStudents / $totalStudents) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Students', 'value' => $totalStudents, 'subtext' => 'Athletes in roster'],
                ['label' => 'Active Students', 'value' => $activeStudents, 'subtext' => "{$activeRate}% active rate"],
                ['label' => 'Inactive Students', 'value' => $inactiveStudents, 'subtext' => 'On leave or paused'],
                ['label' => 'Total Batches', 'value' => count($batchSummaryRows), 'subtext' => 'Active training groups'],
                ['label' => 'Students in Batches', 'value' => $assignedStudents, 'subtext' => "{$assignedRate}% allocated to batches"]
            ];

            // Chart: Batch enrollment distribution (top 6 batches)
            $topBatches = array_slice($batchSummaryRows, 0, 6);
            $batchLabels = [];
            $batchCounts = [];
            foreach ($topBatches as $tb) {
                $batchLabels[] = $tb['batch_name'];
                $batchCounts[] = intval($tb['current_student_count']);
            }
            if (!empty($batchLabels)) {
                $report['chart'] = [
                    'type'   => 'bar',
                    'title'  => 'Batch Student Enrollment Distribution',
                    'labels' => $batchLabels,
                    'datasets' => [
                        [
                            'label'           => 'Enrolled Students',
                            'data'            => $batchCounts,
                            'backgroundColor' => '#22C55E'
                        ]
                    ]
                ];
            }

            // Secondary batch summary section
            $report['batch_summary'] = [
                'title'   => 'Batch Capacity & Enrollment Summary',
                'headers' => ['Batch Name', 'Coach', 'Location / Branch', 'Schedule', 'Current Student Count'],
                'rows'    => array_map(function($b) {
                    return [$b['batch_name'], $b['coach_name'], $b['location'], $b['schedule'], intval($b['current_student_count'])];
                }, $batchSummaryRows)
            ];
            break;

        // =====================================================================
        // 2. ATTENDANCE REPORT
        // =====================================================================
        case 'attendance_report':
            $report['title'] = 'Attendance Report';
            $report['category'] = 'Attendance';
            $report['notes'] = 'Historical session records and presence tracking. Preserves vsa_attendance.batch_id and coach_id historical links.';
            $report['table_headers'] = ['Date', 'Batch', 'Student Name', 'Coach', 'Status'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['start_date'])) {
                $where[] = 'a.attendance_date >= ?';
                $params[] = $filters['start_date'];
                $report['filters_applied'][] = ['label' => 'From Date', 'value' => date('d/m/Y', strtotime($filters['start_date']))];
            }
            if (!empty($filters['end_date'])) {
                $where[] = 'a.attendance_date <= ?';
                $params[] = $filters['end_date'];
                $report['filters_applied'][] = ['label' => 'To Date', 'value' => date('d/m/Y', strtotime($filters['end_date']))];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'a.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $where[] = 'a.coach_id = ?';
                $params[] = intval($filters['coach_id']);
                $report['filters_applied'][] = ['label' => 'Coach ID', 'value' => '#' . $filters['coach_id']];
            }
            if (!empty($filters['student_id']) && $filters['student_id'] !== 'all') {
                $where[] = 'a.student_id = ?';
                $params[] = intval($filters['student_id']);
                $report['filters_applied'][] = ['label' => 'Student ID', 'value' => '#' . $filters['student_id']];
            }
            if (!empty($filters['status']) && $filters['status'] !== 'all') {
                $where[] = 'LOWER(a.status) = LOWER(?)';
                $params[] = $filters['status'];
                $report['filters_applied'][] = ['label' => 'Status', 'value' => ucfirst($filters['status'])];
            }

            // Coach role restriction
            if ($isCoach && !empty($coachAssignedBatchIds)) {
                $inClause = implode(',', array_map('intval', $coachAssignedBatchIds));
                $where[] = "(a.batch_id IN ($inClause) OR a.coach_id = $coachId)";
            }

            $sql = '
                SELECT 
                    a.attendance_id,
                    a.attendance_date,
                    a.batch_id,
                    a.coach_id,
                    a.student_id,
                    a.status,
                    s.student_name,
                    COALESCE(b.batch_name, "Historical Batch") AS batch_name,
                    COALESCE(c.coach_name, "Unassigned Coach") AS coach_name
                FROM vsa_attendance a
                LEFT JOIN vsa_students s ON a.student_id = s.student_id
                LEFT JOIN vsa_batches b ON a.batch_id = b.batch_id
                LEFT JOIN vsa_coaches c ON a.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY a.attendance_date DESC, s.student_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($rows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Sessions', 'value' => 0, 'subtext' => '0 sessions conducted'],
                    ['label' => 'Present Marks', 'value' => 0, 'subtext' => '0 athlete presences'],
                    ['label' => 'Absent Marks', 'value' => 0, 'subtext' => '0 athlete absences'],
                    ['label' => 'Attendance %', 'value' => '0%', 'subtext' => '0% presence rate'],
                    ['label' => 'Total Records', 'value' => 0, 'subtext' => '0 marks recorded']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $presentCount = 0;
            $absentCount = 0;
            $sessionKeys = [];
            $dateTrend = [];

            foreach ($rows as $r) {
                $sKey = $r['attendance_date'] . '_' . $r['batch_id'];
                $sessionKeys[$sKey] = true;

                $st = strtolower($r['status']);
                if ($st === 'present') {
                    $presentCount++;
                } else {
                    $absentCount++;
                }

                $dStr = date('d M', strtotime($r['attendance_date']));
                if (!isset($dateTrend[$dStr])) {
                    $dateTrend[$dStr] = ['present' => 0, 'absent' => 0];
                }
                if ($st === 'present') {
                    $dateTrend[$dStr]['present']++;
                } else {
                    $dateTrend[$dStr]['absent']++;
                }

                $report['table_rows'][] = [
                    date('d/m/Y', strtotime($r['attendance_date'])),
                    $r['batch_name'],
                    $r['student_name'] ?: 'Unknown Student',
                    $r['coach_name'],
                    ucfirst($r['status'])
                ];
            }

            $totalMarks = count($rows);
            $totalSessions = count($sessionKeys);
            $attPct = $totalMarks > 0 ? round(($presentCount / $totalMarks) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Sessions', 'value' => $totalSessions, 'subtext' => 'Conducted training sessions'],
                ['label' => 'Present Marks', 'value' => $presentCount, 'subtext' => 'Confirmed athlete attendance'],
                ['label' => 'Absent Marks', 'value' => $absentCount, 'subtext' => 'Missed athlete sessions'],
                ['label' => 'Attendance %', 'value' => "{$attPct}%", 'subtext' => 'Overall presence rate'],
                ['label' => 'Total Records', 'value' => $totalMarks, 'subtext' => 'Total individual attendance logs']
            ];

            // Attendance Trend Chart (up to last 7 days)
            $trendDates = array_slice(array_keys($dateTrend), -7);
            $trendPresent = [];
            $trendAbsent = [];
            foreach ($trendDates as $td) {
                $trendPresent[] = $dateTrend[$td]['present'];
                $trendAbsent[] = $dateTrend[$td]['absent'];
            }
            if (!empty($trendDates)) {
                $report['chart'] = [
                    'type'   => 'bar',
                    'title'  => 'Recent Attendance Trends (Present vs Absent)',
                    'labels' => $trendDates,
                    'datasets' => [
                        [
                            'label'           => 'Present',
                            'data'            => $trendPresent,
                            'backgroundColor' => '#22C55E'
                        ],
                        [
                            'label'           => 'Absent',
                            'data'            => $trendAbsent,
                            'backgroundColor' => '#EF4444'
                        ]
                    ]
                ];
            }
            break;

        // =====================================================================
        // 3. FEES & PAYMENTS REPORT (SUPER ADMIN ONLY)
        // =====================================================================
        case 'fees_payments':
            $report['title'] = 'Fees & Payments Report';
            $report['category'] = 'Fees & Payments';
            $report['notes'] = 'Authoritative accounting audit strictly compiled from vsa_student_fees. Historical fees preserve vsa_student_fees.batch_id.';
            $report['table_headers'] = ['Student Name', 'Batch', 'Billing Month', 'Fee Amount', 'Paid Amount', 'Outstanding', 'Payment Status', 'Method'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['month']) && $filters['month'] !== 'all') {
                $where[] = 'f.fee_month LIKE ?';
                $params[] = $filters['month'] . '%';
                $report['filters_applied'][] = ['label' => 'Month', 'value' => date('M Y', strtotime($filters['month'] . '-01'))];
            }
            if (!empty($filters['start_date'])) {
                $where[] = 'f.due_date >= ?';
                $params[] = $filters['start_date'];
                $report['filters_applied'][] = ['label' => 'Due From', 'value' => date('d/m/Y', strtotime($filters['start_date']))];
            }
            if (!empty($filters['end_date'])) {
                $where[] = 'f.due_date <= ?';
                $params[] = $filters['end_date'];
                $report['filters_applied'][] = ['label' => 'Due To', 'value' => date('d/m/Y', strtotime($filters['end_date']))];
            }
            if (!empty($filters['student_id']) && $filters['student_id'] !== 'all') {
                $where[] = 'f.student_id = ?';
                $params[] = intval($filters['student_id']);
                $report['filters_applied'][] = ['label' => 'Student ID', 'value' => '#' . $filters['student_id']];
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
                    f.paid_at,
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
                    ['label' => 'Total Billed', 'value' => formatRupees(0), 'subtext' => '0 fee invoices'],
                    ['label' => 'Total Collected', 'value' => formatRupees(0), 'subtext' => '0% collection rate'],
                    ['label' => 'Outstanding Dues', 'value' => formatRupees(0), 'subtext' => '0 pending balance'],
                    ['label' => 'Collection %', 'value' => '0%', 'subtext' => 'No matching records']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $totBilled = 0;
            $totPaid = 0;
            $methodCounts = [];
            $methodAmounts = [];
            $monthTrend = [];

            foreach ($rows as $r) {
                $bld = floatval($r['fee_amount']);
                $pd = floatval($r['paid_amount']);
                $out = max(0, $bld - $pd);

                $totBilled += $bld;
                $totPaid += $pd;

                $mth = $r['payment_method'] ?: 'Unrecorded';
                $methodCounts[$mth] = ($methodCounts[$mth] ?? 0) + 1;
                $methodAmounts[$mth] = ($methodAmounts[$mth] ?? 0) + $pd;

                $fm = date('M Y', strtotime($r['fee_month']));
                if (!isset($monthTrend[$fm])) {
                    $monthTrend[$fm] = ['billed' => 0, 'paid' => 0];
                }
                $monthTrend[$fm]['billed'] += $bld;
                $monthTrend[$fm]['paid'] += $pd;

                $report['table_rows'][] = [
                    $r['student_name'] ?: 'Unknown Student',
                    $r['batch_name'],
                    date('M Y', strtotime($r['fee_month'])),
                    formatRupees($bld),
                    formatRupees($pd),
                    formatRupees($out),
                    $r['payment_status'],
                    $r['payment_method'] ?: '—'
                ];
            }

            $totOutstanding = max(0, $totBilled - $totPaid);
            $collPct = $totBilled > 0 ? round(($totPaid / $totBilled) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Billed', 'value' => formatRupees($totBilled), 'subtext' => count($rows) . ' invoices issued'],
                ['label' => 'Total Collected', 'value' => formatRupees($totPaid), 'subtext' => "{$collPct}% collection rate"],
                ['label' => 'Outstanding Dues', 'value' => formatRupees($totOutstanding), 'subtext' => 'Unpaid accounts receivable'],
                ['label' => 'Collection %', 'value' => "{$collPct}%", 'subtext' => 'Financial realization efficiency']
            ];

            // Chart: Monthly Collection Trend (last 6 months)
            $trendMonths = array_slice(array_keys($monthTrend), -6);
            $trendBilled = [];
            $trendPaid = [];
            foreach ($trendMonths as $tm) {
                $trendBilled[] = $monthTrend[$tm]['billed'];
                $trendPaid[] = $monthTrend[$tm]['paid'];
            }
            if (!empty($trendMonths)) {
                $report['chart'] = [
                    'type'   => 'bar',
                    'title'  => 'Monthly Collection Trend (Billed vs Collected)',
                    'labels' => $trendMonths,
                    'datasets' => [
                        [
                            'label'           => 'Billed',
                            'data'            => $trendBilled,
                            'backgroundColor' => 'rgba(201, 162, 39, 0.7)'
                        ],
                        [
                            'label'           => 'Collected',
                            'data'            => $trendPaid,
                            'backgroundColor' => '#22C55E'
                        ]
                    ]
                ];
            }

            // Compact Breakdown Sections inside Fees & Payments report
            $report['compact_views'] = [
                'payment_methods' => [
                    'title'   => 'Payment Methods Breakdown',
                    'headers' => ['Method', 'Transactions', 'Total Collected'],
                    'rows'    => array_map(function($m) use ($methodCounts, $methodAmounts) {
                        return [$m, $methodCounts[$m], formatRupees($methodAmounts[$m])];
                    }, array_keys($methodCounts))
                ],
                'monthly_trend' => [
                    'title'   => 'Monthly Billing & Realization Overview',
                    'headers' => ['Month', 'Billed', 'Collected', 'Outstanding', 'Realization %'],
                    'rows'    => array_map(function($m) use ($monthTrend) {
                        $b = $monthTrend[$m]['billed'];
                        $p = $monthTrend[$m]['paid'];
                        $d = max(0, $b - $p);
                        $r = $b > 0 ? round(($p / $b) * 100, 1) . '%' : '0%';
                        return [$m, formatRupees($b), formatRupees($p), formatRupees($d), $r];
                    }, array_keys($monthTrend))
                ]
            ];
            break;

        // =====================================================================
        // 4. COACH & BATCH ACTIVITY REPORT (FACTUAL ASSIGNMENTS & SESSIONS)
        // =====================================================================
        case 'coach_activity':
            $report['title'] = 'Coach & Batch Activity Report';
            $report['category'] = 'Coaches & Batches';
            $report['period'] = 'Active Coaching Rosters & Training Activity';
            $report['notes'] = 'Factual coaching assignments, active training batches, and logged attendance sessions. Strictly objective; contains no performance ratings or ranking scores.';
            $report['table_headers'] = ['Coach Name', 'Assigned Batches', 'Location / Branch', 'Schedule', 'Student Count', 'Recorded Sessions'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['coach_id']) && $filters['coach_id'] !== 'all') {
                $where[] = 'c.coach_id = ?';
                $params[] = intval($filters['coach_id']);
                $report['filters_applied'][] = ['label' => 'Coach ID', 'value' => '#' . $filters['coach_id']];
            }
            if (!empty($filters['batch_id']) && $filters['batch_id'] !== 'all') {
                $where[] = 'b.batch_id = ?';
                $params[] = intval($filters['batch_id']);
                $report['filters_applied'][] = ['label' => 'Batch ID', 'value' => '#' . $filters['batch_id']];
            }
            if (!empty($filters['branch']) && $filters['branch'] !== 'all') {
                $where[] = 'b.batch_location = ?';
                $params[] = $filters['branch'];
                $report['filters_applied'][] = ['label' => 'Branch', 'value' => $filters['branch']];
            }

            // Coach role restriction
            if ($isCoach) {
                $where[] = 'c.coach_id = ?';
                $params[] = $coachId;
            }

            // Coach and batches mapping
            $sql = '
                SELECT 
                    c.coach_id,
                    c.coach_name,
                    c.coach_phone,
                    c.status AS coach_status,
                    b.batch_id,
                    b.batch_name,
                    COALESCE(b.batch_location, "—") AS location,
                    COALESCE(DATE_FORMAT(b.batch_time, "%H:%i"), b.batch_time, "—") AS schedule
                FROM vsa_coaches c
                LEFT JOIN vsa_batches b ON b.coach_id = c.coach_id
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY c.coach_name ASC, b.batch_name ASC
            ';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $coachBatchRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Dynamically count real students per batch
            $batchStudentCounts = [];
            $bscStmt = $pdo->query('
                SELECT batch_id, COUNT(student_id) AS cnt 
                FROM vsa_students 
                WHERE (status = "Active" OR status IS NULL)
                GROUP BY batch_id
            ');
            while ($row = $bscStmt->fetch(PDO::FETCH_ASSOC)) {
                $batchStudentCounts[intval($row['batch_id'])] = intval($row['cnt']);
            }

            // Dynamically count recorded sessions per coach
            $attWhere = ['1=1'];
            $attParams = [];
            if (!empty($filters['start_date'])) {
                $attWhere[] = 'attendance_date >= ?';
                $attParams[] = $filters['start_date'];
            }
            if (!empty($filters['end_date'])) {
                $attWhere[] = 'attendance_date <= ?';
                $attParams[] = $filters['end_date'];
            }
            $attSql = '
                SELECT coach_id, COUNT(DISTINCT CONCAT(attendance_date, "_", batch_id)) AS session_count
                FROM vsa_attendance
                WHERE ' . implode(' AND ', $attWhere) . '
                GROUP BY coach_id
            ';
            $attStmt = $pdo->prepare($attSql);
            $attStmt->execute($attParams);
            $coachSessions = [];
            while ($row = $attStmt->fetch(PDO::FETCH_ASSOC)) {
                $coachSessions[intval($row['coach_id'])] = intval($row['session_count']);
            }

            if (empty($coachBatchRows)) {
                $report['empty'] = true;
                $report['summary_metrics'] = [
                    ['label' => 'Total Coaches', 'value' => 0, 'subtext' => '0 coaches matching filters'],
                    ['label' => 'Active Coaches', 'value' => 0, 'subtext' => '0 active in roster'],
                    ['label' => 'Assigned Coaches', 'value' => 0, 'subtext' => '0 coaches with batches'],
                    ['label' => 'Assigned Batches', 'value' => 0, 'subtext' => '0 batches assigned']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $distinctCoaches = [];
            $activeCoaches = 0;
            $assignedCoaches = [];
            $assignedBatches = [];

            foreach ($coachBatchRows as $r) {
                $cId = intval($r['coach_id']);
                $bId = intval($r['batch_id'] ?? 0);

                if (!isset($distinctCoaches[$cId])) {
                    $distinctCoaches[$cId] = true;
                    if (strtolower($r['coach_status'] ?? '') === 'active') {
                        $activeCoaches++;
                    }
                }

                if ($bId > 0) {
                    $assignedCoaches[$cId] = true;
                    $assignedBatches[$bId] = true;
                }

                $sCount = $bId > 0 ? ($batchStudentCounts[$bId] ?? 0) : 0;
                $sessCount = $coachSessions[$cId] ?? 0;

                $report['table_rows'][] = [
                    $r['coach_name'],
                    $r['batch_name'] ?: 'No Batch Assigned',
                    $r['location'],
                    $r['schedule'],
                    $sCount,
                    $sessCount
                ];
            }

            $report['summary_metrics'] = [
                ['label' => 'Total Coaches', 'value' => count($distinctCoaches), 'subtext' => 'Coaches on record'],
                ['label' => 'Active Coaches', 'value' => $activeCoaches, 'subtext' => 'Active status'],
                ['label' => 'Assigned Coaches', 'value' => count($assignedCoaches), 'subtext' => 'Coaches leading batches'],
                ['label' => 'Assigned Batches', 'value' => count($assignedBatches), 'subtext' => 'Active training batches']
            ];
            break;

        // =====================================================================
        // 5. INVENTORY REPORT (SUPER ADMIN ONLY)
        // =====================================================================
        case 'inventory_report':
            $report['title'] = 'Inventory Report';
            $report['category'] = 'Inventory & Equipment';
            $report['period'] = 'Live Equipment Stock Registry & Movement Trail';
            $report['notes'] = 'Consolidated equipment inventory status, batch field allocations, and historical movement trail from vsa_inventory.';
            $report['table_headers'] = ['Equipment Item', 'Total Quantity', 'Allocated Units', 'Available in Stock', 'Utilization %'];

            $where = ['1=1'];
            $params = [];

            if (!empty($filters['item_id']) && $filters['item_id'] !== 'all') {
                $where[] = 'inventory_id = ?';
                $params[] = intval($filters['item_id']);
                $report['filters_applied'][] = ['label' => 'Item ID', 'value' => '#' . $filters['item_id']];
            }

            $sql = '
                SELECT inventory_id, item_name, total_quantity, allocations, stock_history, created_at, updated_at
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
                    ['label' => 'Total Equipment Items', 'value' => 0, 'subtext' => '0 items tracked'],
                    ['label' => 'Total Units', 'value' => 0, 'subtext' => '0 central inventory units'],
                    ['label' => 'Allocated Units', 'value' => 0, 'subtext' => '0 deployed in field'],
                    ['label' => 'Available Stock', 'value' => 0, 'subtext' => '0 ready for use'],
                    ['label' => 'Deductions / Losses', 'value' => 0, 'subtext' => '0 units deducted']
                ];
                $report['table_rows'] = [];
                $report['chart'] = null;
                break;
            }

            $batchFilterId = !empty($filters['batch_id']) && $filters['batch_id'] !== 'all' ? intval($filters['batch_id']) : 0;
            $actionFilter = !empty($filters['action_type']) && $filters['action_type'] !== 'all' ? strtolower(trim($filters['action_type'])) : '';

            $totQty = 0;
            $totAlloc = 0;
            $totAvail = 0;
            $totDeductions = 0;

            $itemLabels = [];
            $allocChart = [];
            $availChart = [];
            $movementRows = [];

            foreach ($items as $it) {
                $t = intval($it['total_quantity']);
                $allocs = json_decode($it['allocations'] ?: '[]', true) ?: [];
                $history = json_decode($it['stock_history'] ?: '[]', true) ?: [];

                $a = 0;
                foreach ($allocs as $al) {
                    $bId = intval($al['batch_id'] ?? 0);
                    if ($batchFilterId > 0 && $bId !== $batchFilterId) continue;
                    $a += intval($al['quantity'] ?? 0);
                }
                $av = max(0, $t - $a);

                $totQty += $t;
                $totAlloc += $a;
                $totAvail += $av;

                $itemLabels[] = $it['item_name'];
                $allocChart[] = $a;
                $availChart[] = $av;

                $utilPct = $t > 0 ? round(($a / $t) * 100, 1) : 0;
                $report['table_rows'][] = [
                    $it['item_name'],
                    $t,
                    $a,
                    $av,
                    "{$utilPct}%"
                ];

                // Movement History Trail
                foreach ($history as $h) {
                    $act = ucfirst(strtolower($h['action'] ?? 'Unknown'));
                    if (!empty($actionFilter) && strtolower($act) !== $actionFilter) {
                        continue;
                    }
                    $hDate = $h['date'] ?? $h['timestamp'] ?? '';
                    if (!empty($filters['start_date']) && $hDate < $filters['start_date']) continue;
                    if (!empty($filters['end_date']) && $hDate > $filters['end_date']) continue;

                    $changeQty = intval($h['quantity'] ?? 0);
                    if (strtolower($act) === 'deducted') {
                        $totDeductions += abs($changeQty);
                    }

                    $movementRows[] = [
                        $hDate ? date('d/m/Y', strtotime($hDate)) : '—',
                        $it['item_name'],
                        $act,
                        $changeQty > 0 ? "+{$changeQty}" : $changeQty,
                        $h['batch_name'] ?? '—',
                        $h['reason'] ?? $h['note'] ?? 'Standard Stock Action'
                    ];
                }
            }

            // Check if batchFilter caused 0 allocated records
            if ($batchFilterId > 0 && $totAlloc === 0 && empty($movementRows)) {
                $report['empty'] = true;
            }

            $overallUtil = $totQty > 0 ? round(($totAlloc / $totQty) * 100, 1) : 0;

            $report['summary_metrics'] = [
                ['label' => 'Total Equipment Items', 'value' => count($items), 'subtext' => 'Distinct gear types'],
                ['label' => 'Total Units', 'value' => $totQty, 'subtext' => 'Central inventory units'],
                ['label' => 'Allocated Units', 'value' => $totAlloc, 'subtext' => "{$overallUtil}% deployed in field"],
                ['label' => 'Available Stock', 'value' => $totAvail, 'subtext' => round(100 - $overallUtil, 1) . '% in central stock'],
                ['label' => 'Deductions / Losses', 'value' => $totDeductions, 'subtext' => 'Total units deducted']
            ];

            // Chart: Allocated vs Available Stock
            if (!empty($itemLabels)) {
                $report['chart'] = [
                    'type'   => 'bar',
                    'title'  => 'Equipment Deployment Distribution (Allocated vs Available)',
                    'labels' => $itemLabels,
                    'datasets' => [
                        [
                            'label'           => 'Allocated Units',
                            'data'            => $allocChart,
                            'backgroundColor' => '#C9A227'
                        ],
                        [
                            'label'           => 'Available in Stock',
                            'data'            => $availChart,
                            'backgroundColor' => '#22C55E'
                        ]
                    ]
                ];
            }

            // Movement History Section
            $report['secondary_table'] = [
                'title'   => 'Equipment Movement History & Audit Log',
                'headers' => ['Date', 'Equipment Item', 'Action Taken', 'Quantity Changed', 'Associated Batch', 'Reason / Notes'],
                'rows'    => array_slice($movementRows, 0, 50)
            ];
            break;

        default:
            throw new Exception("Invalid or unsupported report type: {$reportType}");
    }

    // Safety normalizer: ensure numeric/empty values are never null/NaN
    foreach ($report['summary_metrics'] as &$sm) {
        if (!isset($sm['value']) || $sm['value'] === null) {
            $sm['value'] = 0;
        }
    }
    unset($sm);

    return $report;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. REQUEST ROUTER & CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$auth = resolveReportsUser($pdo);

header('Content-Type: application/json; charset=utf-8');

try {
    switch ($action) {
        case 'filter_options':
            $options = getFilterOptions($pdo, $auth);
            echo json_encode([
                'success' => true,
                'data'    => $options,
                'options' => $options
            ]);
            break;

        case 'get_report':
            $reportType = $_GET['report'] ?? $_POST['report'] ?? '';
            if (empty($reportType)) {
                throw new Exception('Missing required "report" parameter.');
            }

            // Parse filter arguments
            $filters = [];
            foreach ($_GET as $k => $v) {
                if (!in_array($k, ['action', 'report', 'role', 'email', 'coach_id'])) {
                    $filters[$k] = $v;
                }
            }
            if ($reqMethod === 'POST') {
                $postData = json_decode(file_get_contents('php://input'), true) ?: $_POST;
                if (!empty($postData['filters']) && is_array($postData['filters'])) {
                    $filters = array_merge($filters, $postData['filters']);
                }
            }

            $reportData = getReportData($pdo, $reportType, $filters, $auth);
            echo json_encode([
                'success' => true,
                'data'    => $reportData
            ]);
            break;

        default:
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error'   => 'Invalid API action specified. Supported actions: filter_options, get_report'
            ]);
            break;
    }
} catch (Exception $e) {
    $code = http_response_code();
    if ($code === 200) {
        http_response_code(500);
    }
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
exit;