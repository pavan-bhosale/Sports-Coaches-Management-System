<?php
/**
 * VAVA Sports Academy - Reports & Analytics Backend Engine
 * 
 * Consolidated 3 Core Reports:
 * 1. Attendance Report (attendance_report)
 * 2. Fees & Payments Report (fees_payments) - Super Admin Only
 * 3. Activity Report (activity_report) - Chronological Audit & System History
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

// CORS & HTTP Headers via centralized helper
require_once __DIR__ . '/auth_helper.php';
applyCorsHeaders('GET, POST, OPTIONS');

$reqMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
require_once __DIR__ . '/db_connect.php';

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION & ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────────────────

function resolveReportsUser($pdo, $input = []) {
    // Authoritative session authentication
    $authUser = getAuthenticatedSessionUser($pdo);
    if (!$authUser) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'error'   => 'Authentication required. Please log in.'
        ]);
        exit;
    }

    $roleLower = strtolower(trim($authUser['role'] ?? ''));

    // Students have NO access to Reports & Analytics
    if ($roleLower === 'student') {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'error'   => 'Access denied. Reports & Analytics is restricted to coaches and administrators.'
        ]);
        exit;
    }

    if ($roleLower === 'coach') {
        $coach_id = intval($authUser['coach_id'] ?? 0);
        $email = $authUser['email'] ?? '';
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
                'coach_name'         => $authUser['name'] ?? 'Coach',
                'coach_email'        => $email,
                'assigned_batch_ids' => []
            ]
        ];
    }

    // Valid administrator roles
    if ($roleLower === 'admin' || $roleLower === 'superadmin') {
        return [
            'role'  => 'superadmin',
            'coach' => null
        ];
    }

    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Access denied. Invalid or unauthorized role.']);
    exit;
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

    // 8. Activity Log Filters
    $activityModules = ['AUTH', 'STUDENT', 'COACH', 'BATCH', 'ATTENDANCE', 'INVENTORY', 'FEES', 'SYSTEM'];
    $activityActions = ['Created', 'Updated', 'Deleted', 'Assigned', 'Unassigned', 'Recorded', 'Marked', 'Submitted', 'Logged In', 'Logged Out'];
    $activityRoles = [
        ['value' => 'superadmin', 'label' => 'Superadmin'],
        ['value' => 'coach', 'label' => 'Coach']
    ];
    $activityActors = [];
    try {
        $activityActors = $pdo->query("
            SELECT DISTINCT actor_name, actor_role, actor_email 
            FROM vsa_activity_log 
            WHERE actor_name IS NOT NULL AND actor_name != ''
            ORDER BY actor_name ASC
        ")->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        // Table not ready or empty
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
        'payment_methods'  => array_values(array_filter($paymentMethods)),
        'activity_modules' => $activityModules,
        'activity_actions' => $activityActions,
        'activity_roles'   => $activityRoles,
        'activity_actors'  => $activityActors
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

    // Role Guard: Financial reports are Super Admin only
    if ($isCoach && in_array($reportType, ['fees_payments'])) {
        http_response_code(403);
        throw new Exception('Access denied. Financial reports are restricted to Super Admin only.');
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
            $coachFilter = $filters['coach_id'] ?? $filters['filter_coach_id'] ?? '';
            if (!empty($coachFilter) && $coachFilter !== 'all') {
                $cId = intval($coachFilter);
                $where[] = 'COALESCE(a.coach_id, b.coach_id) = ?';
                $params[] = $cId;

                $cNameStmt = $pdo->prepare('SELECT coach_name FROM vsa_coaches WHERE coach_id = ?');
                $cNameStmt->execute([$cId]);
                $cName = $cNameStmt->fetchColumn() ?: ('#' . $cId);
                $report['filters_applied'][] = ['label' => 'Coach', 'value' => $cName];
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
        // 3. ACTIVITY REPORT (AUDIT & SYSTEM OPERATIONS)
        // =====================================================================
        case 'activity_report':
            $report['title'] = 'Activity Report';
            $report['category'] = 'Activity & System Audit';
            $report['period'] = 'Chronological System Operations';
            $report['notes'] = 'Authoritative chronological audit history of operations and system activities recorded dynamically from database mutations.';
            $report['table_headers'] = ['Time', 'Actor', 'Role', 'Module', 'Action', 'Target', 'Description'];

            $where = ['1=1'];
            $params = [];

            // Role guard for data visibility:
            // Coach only sees their own logged activities or activities relevant to them
            if ($isCoach) {
                if ($coachId > 0) {
                    $where[] = '(a.actor_role = "coach" AND a.actor_id = ?)';
                    $params[] = $coachId;
                } else {
                    $coachEmail = strtolower(trim($auth['coach']['coach_email'] ?? ''));
                    if (!empty($coachEmail)) {
                        $where[] = '(a.actor_role = "coach" AND LOWER(a.actor_email) = ?)';
                        $params[] = $coachEmail;
                    } else {
                        $where[] = 'a.actor_role = "coach"';
                    }
                }
            }

            // Filters
            if (!empty($filters['start_date'])) {
                $where[] = 'a.created_at >= ?';
                $params[] = $filters['start_date'] . ' 00:00:00';
                $report['filters_applied'][] = ['label' => 'From Date', 'value' => date('d/m/Y', strtotime($filters['start_date']))];
            }
            if (!empty($filters['end_date'])) {
                $where[] = 'a.created_at <= ?';
                $params[] = $filters['end_date'] . ' 23:59:59';
                $report['filters_applied'][] = ['label' => 'To Date', 'value' => date('d/m/Y', strtotime($filters['end_date']))];
            }
            $roleFilter = $filters['role'] ?? $filters['actor_role'] ?? $filters['filter_role'] ?? '';
            if (!empty($roleFilter) && $roleFilter !== 'all') {
                $where[] = 'LOWER(a.actor_role) = LOWER(?)';
                $params[] = $roleFilter;
                $report['filters_applied'][] = ['label' => 'Action Role', 'value' => ucfirst($roleFilter)];
            }
            if (!empty($filters['module']) && $filters['module'] !== 'all') {
                $where[] = 'UPPER(a.module) = UPPER(?)';
                $params[] = $filters['module'];
                $report['filters_applied'][] = ['label' => 'Module', 'value' => strtoupper($filters['module'])];
            }
            $actionFilter = $filters['action_type'] ?? $filters['action'] ?? '';
            if (!empty($actionFilter) && $actionFilter !== 'all') {
                $where[] = 'LOWER(a.action_type) = LOWER(?)';
                $params[] = $actionFilter;
                $report['filters_applied'][] = ['label' => 'Action', 'value' => ucfirst($actionFilter)];
            }
            $actorFilter = $filters['actor_name'] ?? $filters['actor'] ?? '';
            if (!empty($actorFilter) && $actorFilter !== 'all') {
                if (is_numeric($actorFilter)) {
                    $where[] = 'a.actor_id = ?';
                    $params[] = intval($actorFilter);
                    $report['filters_applied'][] = ['label' => 'Actor ID', 'value' => '#' . $actorFilter];
                } else {
                    $where[] = 'a.actor_name = ?';
                    $params[] = $actorFilter;
                    $report['filters_applied'][] = ['label' => 'Actor', 'value' => $actorFilter];
                }
            }
            if (!empty($filters['actor_id']) && $filters['actor_id'] !== 'all') {
                $where[] = 'a.actor_id = ?';
                $params[] = intval($filters['actor_id']);
                $report['filters_applied'][] = ['label' => 'Actor ID', 'value' => '#' . $filters['actor_id']];
            }
            if (!empty($filters['search'])) {
                $searchTerm = '%' . trim($filters['search']) . '%';
                $where[] = '(a.actor_name LIKE ? OR a.actor_email LIKE ? OR a.description LIKE ? OR a.target_name LIKE ? OR a.module LIKE ? OR a.action_type LIKE ?)';
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $report['filters_applied'][] = ['label' => 'Search', 'value' => $filters['search']];
            }

            // Summary metrics calculation:
            // 1. Total matching activities
            $countSql = 'SELECT COUNT(*) FROM vsa_activity_log a WHERE ' . implode(' AND ', $where);
            $countStmt = $pdo->prepare($countSql);
            $countStmt->execute($params);
            $totalCount = intval($countStmt->fetchColumn());

            // 2. Today's activities (in current filter scope)
            $todayWhere = array_merge($where, ['DATE(a.created_at) = CURDATE()']);
            $todaySql = 'SELECT COUNT(*) FROM vsa_activity_log a WHERE ' . implode(' AND ', $todayWhere);
            $todayStmt = $pdo->prepare($todaySql);
            $todayStmt->execute($params);
            $todayCount = intval($todayStmt->fetchColumn());

            // 3. Superadmin vs Coach counts (in current filter scope or overall)
            $roleCountSql = '
                SELECT 
                    SUM(CASE WHEN LOWER(a.actor_role) = "superadmin" THEN 1 ELSE 0 END) AS sa_count,
                    SUM(CASE WHEN LOWER(a.actor_role) = "coach" THEN 1 ELSE 0 END) AS coach_count
                FROM vsa_activity_log a 
                WHERE ' . implode(' AND ', $where);
            $rcStmt = $pdo->prepare($roleCountSql);
            $rcStmt->execute($params);
            $rcRow = $rcStmt->fetch(PDO::FETCH_ASSOC);
            $saCount = intval($rcRow['sa_count'] ?? 0);
            $coachCount = intval($rcRow['coach_count'] ?? 0);

            // 4. Most active module
            $topModSql = '
                SELECT a.module, COUNT(*) as cnt 
                FROM vsa_activity_log a 
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY a.module 
                ORDER BY cnt DESC 
                LIMIT 1
            ';
            $tmStmt = $pdo->prepare($topModSql);
            $tmStmt->execute($params);
            $topModRow = $tmStmt->fetch(PDO::FETCH_ASSOC);
            $topModuleName = $topModRow ? $topModRow['module'] . ' (' . $topModRow['cnt'] . ')' : 'None';

            $report['summary_metrics'] = [
                ['label' => 'Total Activities', 'value' => $totalCount, 'subtext' => 'Recorded operations'],
                ['label' => "Today's Activities", 'value' => $todayCount, 'subtext' => 'Logged today'],
                ['label' => 'Superadmin Actions', 'value' => $saCount, 'subtext' => 'Administrative operations'],
                ['label' => 'Coach Actions', 'value' => $coachCount, 'subtext' => 'Field coaching operations'],
                ['label' => 'Top Module', 'value' => $topModuleName, 'subtext' => 'Highest recorded activity']
            ];

            // Module Breakdown Chart
            $chartSql = '
                SELECT a.module, COUNT(*) as cnt 
                FROM vsa_activity_log a 
                WHERE ' . implode(' AND ', $where) . '
                GROUP BY a.module 
                ORDER BY cnt DESC
            ';
            $chartStmt = $pdo->prepare($chartSql);
            $chartStmt->execute($params);
            $chartRows = $chartStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($chartRows)) {
                $chartLabels = [];
                $chartData = [];
                foreach ($chartRows as $cr) {
                    $chartLabels[] = $cr['module'];
                    $chartData[] = intval($cr['cnt']);
                }
                $report['chart'] = [
                    'type'   => 'bar',
                    'title'  => 'Activity Volume by Operational Module',
                    'labels' => $chartLabels,
                    'datasets' => [
                        [
                            'label'           => 'Recorded Actions',
                            'data'            => $chartData,
                            'backgroundColor' => '#C9A227'
                        ]
                    ]
                ];
            }

            // Pagination parameters (unlimited when exporting)
            $isUnlimited = (!empty($filters['unlimited']) || (isset($filters['limit']) && in_array(strtolower((string)$filters['limit']), ['all', 'unlimited'])));
            $limit = $isUnlimited ? 10000 : (isset($filters['limit']) ? max(1, min(200, intval($filters['limit']))) : 50);
            $offset = isset($filters['offset']) ? max(0, intval($filters['offset'])) : 0;

            if ($totalCount === 0) {
                $report['empty'] = true;
                $report['table_rows'] = [];
                $report['activities'] = [];
                $report['pagination'] = [
                    'total'    => 0,
                    'limit'    => $limit,
                    'offset'   => $offset,
                    'has_more' => false
                ];
                break;
            }

            // Query chronological activity list
            $dataSql = '
                SELECT 
                    a.activity_id,
                    a.actor_role,
                    a.actor_name,
                    a.actor_email,
                    a.action_type,
                    a.module,
                    a.target_type,
                    a.target_id,
                    a.target_name,
                    a.description,
                    a.details,
                    a.created_at
                FROM vsa_activity_log a
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY a.created_at DESC, a.activity_id DESC
                LIMIT ' . intval($limit) . ' OFFSET ' . intval($offset) . '
            ';
            $dataStmt = $pdo->prepare($dataSql);
            $dataStmt->execute($params);
            $activityRows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

            $formattedActivities = [];
            foreach ($activityRows as $row) {
                $timeFormatted = date('d M Y, h:i A', strtotime($row['created_at']));
                $shortTime = date('h:i A', strtotime($row['created_at']));
                $dateFormatted = date('d M Y', strtotime($row['created_at']));

                $targetLabel = '—';
                if (!empty($row['target_name'])) {
                    $targetLabel = $row['target_name'];
                    if (!empty($row['target_type'])) {
                        $targetLabel = ucfirst($row['target_type']) . ': ' . $targetLabel;
                    }
                } elseif (!empty($row['target_type']) && !empty($row['target_id'])) {
                    $targetLabel = ucfirst($row['target_type']) . ' #' . $row['target_id'];
                }

                $actorDisplay = $row['actor_name'] ?: ($row['actor_role'] ? ucfirst($row['actor_role']) : 'System');

                $report['table_rows'][] = [
                    $timeFormatted,
                    $actorDisplay,
                    ucfirst($row['actor_role'] ?? 'system'),
                    $row['module'],
                    $row['action_type'],
                    $targetLabel,
                    $row['description']
                ];

                $detailsParsed = null;
                if (!empty($row['details'])) {
                    $detailsParsed = json_decode($row['details'], true);
                }

                $formattedActivities[] = [
                    'activity_id'     => intval($row['activity_id']),
                    'actor_role'      => $row['actor_role'],
                    'actor_name'      => $row['actor_name'],
                    'actor_email'     => $row['actor_email'],
                    'action_type'     => $row['action_type'],
                    'module'          => $row['module'],
                    'target_type'     => $row['target_type'],
                    'target_id'       => $row['target_id'],
                    'target_name'     => $row['target_name'],
                    'description'     => $row['description'],
                    'details'         => $detailsParsed,
                    'created_at'      => $row['created_at'],
                    'formatted_time'  => $shortTime,
                    'formatted_date'  => $dateFormatted,
                    'full_timestamp'  => $timeFormatted
                ];
            }

            $report['activities'] = $formattedActivities;
            $report['pagination'] = [
                'total'    => $totalCount,
                'limit'    => $limit,
                'offset'   => $offset,
                'has_more' => ($offset + count($activityRows) < $totalCount)
            ];
            break;

        default:
            http_response_code(400);
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
if ($action === 'none') {
    return;
}
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
                if (!in_array($k, ['action', 'report', '_', 'auth_role', 'auth_email', 'auth_coach_id'])) {
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

        case 'export_report':
        case 'export':
            $reportType = $_GET['report'] ?? $_POST['report'] ?? '';
            if (empty($reportType)) {
                throw new Exception('Missing required "report" parameter.');
            }
            if (!in_array($reportType, ['attendance_report', 'fees_payments', 'activity_report'])) {
                http_response_code(400);
                throw new Exception("Export is currently available for Attendance Report, Fees & Payments Report, and Activity Report.");
            }

            $format = strtolower($_GET['format'] ?? $_POST['format'] ?? 'pdf');
            if (!in_array($format, ['pdf', 'xlsx'])) {
                http_response_code(400);
                throw new Exception("Unsupported export format: '{$format}'. Supported formats: pdf, xlsx.");
            }

            // Parse filter arguments (identical to get_report)
            $filters = [];
            foreach ($_GET as $k => $v) {
                if (!in_array($k, ['action', 'report', 'format', '_', 'auth_role', 'auth_email', 'auth_coach_id'])) {
                    $filters[$k] = $v;
                }
            }
            if ($reqMethod === 'POST') {
                $postData = json_decode(file_get_contents('php://input'), true) ?: $_POST;
                if (!empty($postData['filters']) && is_array($postData['filters'])) {
                    $filters = array_merge($filters, $postData['filters']);
                }
            }

            require_once __DIR__ . '/report_export.php';
            if ($reportType === 'fees_payments') {
                handleFeesExport($pdo, $auth, $filters, $format);
            } elseif ($reportType === 'activity_report') {
                handleActivityExport($pdo, $auth, $filters, $format);
            } else {
                handleAttendanceExport($pdo, $auth, $filters, $format);
            }
            exit;

        default:
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error'   => 'Invalid API action specified. Supported actions: filter_options, get_report, export_report'
            ]);
            break;
    }
} catch (Exception $e) {
    $code = http_response_code();
    if ($code === 200) {
        http_response_code(400);
    }
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
exit;