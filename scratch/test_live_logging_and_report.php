<?php
/**
 * Automated End-to-End Test for Activity Logging & Reports Engine
 */

require_once __DIR__ . '/../server/db_connect.php';

function makeRequest($url, $method = 'GET', $data = [], $headers = []) {
    $ch = curl_init();
    $fullUrl = 'http://localhost/VAVA_sports/' . ltrim($url, '/');
    
    $defaultHeaders = [
        'X-VAVA-Role: superadmin',
        'X-VAVA-Email: vavasportsacademy@gmail.com',
        'X-VAVA-Coach-ID: 0',
        'X-VAVA-Actor-Name: Super Admin'
    ];
    $mergedHeaders = array_merge($defaultHeaders, $headers);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if (is_array($data)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            $mergedHeaders[] = 'Content-Type: application/json';
        } else {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        }
    } elseif ($method === 'GET' && !empty($data)) {
        $fullUrl .= '?' . http_build_query($data);
    }
    
    curl_setopt($ch, CURLOPT_URL, $fullUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $mergedHeaders);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return [
        'code' => $httpCode,
        'json' => json_decode($response, true),
        'raw'  => $response
    ];
}

echo "========================================================\n";
echo "1. VERIFY INITIAL ACTIVITY LOG STATE\n";
echo "========================================================\n";
$initCount = (int)$pdo->query("SELECT COUNT(*) FROM vsa_activity_log")->fetchColumn();
echo "Current total activities in vsa_activity_log: $initCount\n\n";

echo "========================================================\n";
echo "2. TEST REAL SYSTEM ACTIONS & HOOKS\n";
echo "========================================================\n";

// Action 1: Add Batch
$testBatchName = 'Test Audit Batch ' . time();
$batchRes = makeRequest('server/batches.php', 'POST', [
    'batch_name'     => $testBatchName,
    'sport'          => 'Football',
    'batch_location' => 'Vasai West',
    'batch_time'     => '17:00:00'
]);
echo "Action 1 (Batch Create): Code {$batchRes['code']} | Success: " . ($batchRes['json']['batch_id'] ? 'YES' : 'NO') . "\n";
$createdBatchId = $batchRes['json']['batch_id'] ?? 0;

// Action 2: Update Batch
if ($createdBatchId) {
    $updateBatchRes = makeRequest('server/batches.php?id=' . $createdBatchId, 'PUT', [
        'batch_name'     => $testBatchName . ' (Updated)',
        'batch_location' => 'Vasai West Stadium',
        'batch_time'     => '17:30:00',
        'sport'          => 'Football'
    ]);
    echo "Action 2 (Batch Update): Code {$updateBatchRes['code']} | Success: " . ($updateBatchRes['json']['batch_id'] ? 'YES' : 'NO') . "\n";
}

// Action 3: Add Coach
$testCoachEmail = 'testcoach' . time() . '@vavasports.com';
$coachRes = makeRequest('server/coaches.php?action=create', 'POST', [
    'coach_name' => 'Audit Coach ' . time(),
    'coach_email' => $testCoachEmail,
    'coach_phone' => '9876543210',
    'coach_sport' => 'Football',
    'status' => 'Active'
]);
echo "Action 3 (Coach Create): Code {$coachRes['code']} | Success: " . ($coachRes['json']['success'] ? 'YES' : 'NO') . "\n";
$createdCoachId = $coachRes['json']['coach_id'] ?? $coachRes['json']['coach']['coach_id'] ?? 0;

// Action 4: Add Student
$studentRes = makeRequest('server/students.php', 'POST', [
    'student_name'          => 'Audit Athlete ' . time(),
    'date_of_birth'         => '2010-05-15',
    'gender'                => 'Male',
    'parent_name'           => 'Parent Name',
    'father_contact_number' => '9876543211',
    'school_name'           => 'Vasai High School',
    'branch_name'           => 'Vasai West',
    'city'                  => 'Vasai',
    'status'                => 'Active',
    'batch_id'              => $createdBatchId ?: 10
]);
echo "Action 4 (Student Create): Code {$studentRes['code']} | Success: " . ($studentRes['json']['success'] ? 'YES' : 'NO') . "\n";
$createdStudentId = $studentRes['json']['student_id'] ?? $studentRes['json']['student']['student_id'] ?? 0;

// Action 5: Inventory Create & Allocate
$itemRes = makeRequest('server/inventory.php?action=create', 'POST', [
    'item_name' => 'Audit Cones ' . time(),
    'total_quantity' => 50
]);
echo "Action 5 (Inventory Create): Code {$itemRes['code']} | Success: " . ($itemRes['json']['success'] ? 'YES' : 'NO') . "\n";
$createdItemId = $itemRes['json']['item']['inventory_id'] ?? $itemRes['json']['inventory_id'] ?? 0;

if ($createdItemId && $createdBatchId) {
    $allocRes = makeRequest('server/inventory.php?action=allocate', 'POST', [
        'inventory_id' => $createdItemId,
        'batch_id' => $createdBatchId,
        'quantity' => 10,
        'note' => 'Allocated for training camp'
    ]);
    echo "Action 6 (Inventory Allocate): Code {$allocRes['code']} | Success: " . ($allocRes['json']['success'] ? 'YES' : 'NO') . "\n";
}

// Action 7: Attendance Recording
$todayDate = date('Y-m-d');
$attSheetRes = makeRequest('server/attendance.php?action=create_sheet', 'POST', [
    'batch_id' => $createdBatchId ?: 10,
    'coach_id' => $createdCoachId ?: 100,
    'attendance_date' => $todayDate
]);
echo "Action 7 (Attendance Create Sheet): Code {$attSheetRes['code']} | Success: " . ($attSheetRes['json']['success'] ? 'YES' : 'NO') . "\n";

// Action 8: Failed Action Verification (Should NOT log activity)
$countBeforeFail = (int)$pdo->query("SELECT COUNT(*) FROM vsa_activity_log")->fetchColumn();
$failRes = makeRequest('server/batches.php?action=create', 'POST', [
    // Missing batch_name and required fields to cause intentional failure
]);
$countAfterFail = (int)$pdo->query("SELECT COUNT(*) FROM vsa_activity_log")->fetchColumn();
echo "Action 8 (Intentional Failure): Request failed as expected: " . (!$failRes['json']['success'] ? 'YES' : 'NO') . " | False Activity Logged: " . ($countAfterFail > $countBeforeFail ? 'FAIL (Logged)' : 'PASS (Not Logged)') . "\n\n";

echo "========================================================\n";
echo "3. VERIFY ACTIVITY REPORT OUTPUT & INTEGRITY\n";
echo "========================================================\n";
$repRes = makeRequest('server/reports.php', 'GET', [
    'action' => 'get_report',
    'report' => 'activity_report'
]);
echo "Activity Report HTTP Code: {$repRes['code']}\n";
echo "Activity Report Success: " . ($repRes['json']['success'] ? 'YES' : 'NO') . "\n";
$metrics = $repRes['json']['data']['summary_metrics'] ?? [];
foreach ($metrics as $m) {
    echo "- Metric '{$m['label']}': {$m['value']} ({$m['subtext']})\n";
}
$acts = $repRes['json']['data']['activities'] ?? [];
echo "Activities Returned in Default View: " . count($acts) . "\n";
if (!empty($acts)) {
    $latest = $acts[0];
    echo "Latest Activity: [{$latest['formatted_time']}] [{$latest['module']}] [{$latest['action_type']}] by {$latest['actor_name']} ({$latest['actor_role']}) => {$latest['description']}\n";
}

echo "\n========================================================\n";
echo "4. VERIFY ACTIVITY REPORT FILTERS\n";
echo "========================================================\n";
// Filter by module = INVENTORY
$invRep = makeRequest('server/reports.php', 'GET', [
    'action' => 'get_report',
    'report' => 'activity_report',
    'module' => 'INVENTORY'
]);
$invActs = $invRep['json']['data']['activities'] ?? [];
echo "Module Filter (INVENTORY): " . count($invActs) . " activities found (All module=INVENTORY: " . (array_reduce($invActs, fn($carry, $a) => $carry && $a['module'] === 'INVENTORY', true) ? 'YES' : 'NO') . ")\n";

// Filter by search
$searchRep = makeRequest('server/reports.php', 'GET', [
    'action' => 'get_report',
    'report' => 'activity_report',
    'search' => 'Audit Cones'
]);
$searchActs = $searchRep['json']['data']['activities'] ?? [];
echo "Search Filter ('Audit Cones'): " . count($searchActs) . " activities found\n";

// Impossible Filter (Zero-Data Test)
$zeroRep = makeRequest('server/reports.php', 'GET', [
    'action' => 'get_report',
    'report' => 'activity_report',
    'search' => 'nonexistent_keyword_impossible_12345'
]);
echo "Zero-Data Test: Code {$zeroRep['code']} | Success: " . ($zeroRep['json']['success'] ? 'YES' : 'NO') . " | Empty Flag: " . ($zeroRep['json']['data']['empty'] ? 'YES' : 'NO') . " | Count: " . count($zeroRep['json']['data']['activities'] ?? []) . "\n";

echo "\n========================================================\n";
echo "5. CLEANUP TEMPORARY TEST ENTITIES\n";
echo "========================================================\n";
if ($createdBatchId) $pdo->exec("DELETE FROM vsa_batches WHERE batch_id = $createdBatchId");
if ($createdCoachId) $pdo->exec("DELETE FROM vsa_coaches WHERE coach_id = $createdCoachId");
if ($createdStudentId) $pdo->exec("DELETE FROM vsa_students WHERE student_id = $createdStudentId");
if ($createdItemId) $pdo->exec("DELETE FROM vsa_inventory WHERE inventory_id = $createdItemId");
echo "Temporary test business records cleaned up successfully.\n";
