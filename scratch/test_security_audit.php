<?php
/**
 * VAVA Sports Academy - Comprehensive Security Audit Test Suite
 * Tests identity tampering, header manipulation, role escalation, and data isolation.
 */

$baseUrl = 'http://localhost/VAVA_sports';

function makeRequest($url, $headers = [], $cookie = '') {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    
    $formattedHeaders = [];
    foreach ($headers as $k => $v) {
        $formattedHeaders[] = "$k: $v";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $formattedHeaders);
    
    if (!empty($cookie)) {
        curl_setopt($ch, CURLOPT_COOKIE, $cookie);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $json = json_decode($response, true);
    return [
        'code' => $httpCode,
        'json' => $json,
        'raw'  => $response
    ];
}

function establishSession($role, $email, $id, $name) {
    global $baseUrl;
    $url = "$baseUrl/scratch/auth_session_helper.php?role=" . urlencode($role) .
           "&email=" . urlencode($email) .
           "&id=" . urlencode($id) .
           "&name=" . urlencode($name);
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    $response = curl_exec($ch);
    curl_close($ch);
    
    preg_match('/Set-Cookie:\s*([^;]+)/mi', $response, $matches);
    $cookie = $matches[1] ?? '';
    return $cookie;
}

echo "===================================================================\n";
echo "VAVA SPORTS — SECURITY & IDENTITY AUTHORIZATION AUDIT\n";
echo "===================================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest($name, $condition, $details = '') {
    global $passCount, $failCount;
    if ($condition) {
        echo "[PASS] $name\n";
        if ($details) echo "       $details\n";
        $passCount++;
    } else {
        echo "[FAIL] $name\n";
        if ($details) echo "       $details\n";
        $failCount++;
    }
}

// -------------------------------------------------------------------------
// TEST 1 — COACH IMPERSONATION
// Authenticate as Coach A (Chirag, ID 100, email chiragdnagvekar@gmail.com).
// Send: X-VAVA-Coach-ID: 101 (Coach B - Tanya Raut).
// Expected: Coach B data must NOT be returned.
// -------------------------------------------------------------------------
echo "--- TEST 1: Coach Impersonation Attack ---\n";
$cookieCoachA = establishSession('coach', 'chiragdnagvekar@gmail.com', 100, 'Chirag Nagvekar');
$res1 = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'     => 'coach',
    'X-VAVA-Email'    => 'chiragdnagvekar@gmail.com',
    'X-VAVA-Coach-ID' => '101' // Attempting to impersonate Coach B!
], $cookieCoachA);

$returnedCoachId = $res1['json']['user']['coach_id'] ?? null;
$batches = $res1['json']['batches']['list'] ?? [];
$hasBatch7 = false; // Batch 7 belongs to Coach B (Tanya)
foreach ($batches as $b) {
    if ($b['batch_id'] == 7) $hasBatch7 = true;
}

assertTest(
    "Coach A cannot impersonate Coach B via X-VAVA-Coach-ID",
    $res1['code'] === 200 && $returnedCoachId === 100 && !$hasBatch7,
    "Resolved Coach ID: $returnedCoachId (Trusted Coach A: 100), Coach B's Batch 7 excluded: " . (!$hasBatch7 ? 'YES' : 'NO')
);

// -------------------------------------------------------------------------
// TEST 2 — STUDENT IMPERSONATION
// Authenticate as Student A (Aarav Sharma, ID 3, email aarav.sharma@vavasports.local).
// Send: X-VAVA-Student-ID: 8 (Student B - Test Student 4).
// Expected: Student B data must NOT be returned.
// -------------------------------------------------------------------------
echo "\n--- TEST 2: Student Impersonation Attack ---\n";
$cookieStudentA = establishSession('student', 'aarav.sharma@vavasports.local', 3, 'Aarav Sharma');
$res2 = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'       => 'student',
    'X-VAVA-Email'      => 'aarav.sharma@vavasports.local',
    'X-VAVA-Student-ID' => '8' // Attempting to impersonate Student B!
], $cookieStudentA);

$returnedStudentId = $res2['json']['user']['student_id'] ?? null;
assertTest(
    "Student A cannot impersonate Student B via X-VAVA-Student-ID",
    $res2['code'] === 200 && $returnedStudentId === 3,
    "Resolved Student ID: $returnedStudentId (Trusted Student A: 3, NOT Student B: 8)"
);

// -------------------------------------------------------------------------
// TEST 3 — ROLE ESCALATION (STUDENT -> SUPER ADMIN)
// Authenticate as Student.
// Send: X-VAVA-Role: superadmin
// Expected: Student must NOT receive Super Admin data.
// -------------------------------------------------------------------------
echo "\n--- TEST 3: Student Role Escalation Attack ---\n";
$res3 = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role' => 'superadmin' // Escalation attempt!
], $cookieStudentA);

$receivedRole3 = $res3['json']['role'] ?? '';
$hasFinances3  = isset($res3['json']['financial']) || isset($res3['json']['finances']);
assertTest(
    "Student cannot escalate to Super Admin via X-VAVA-Role",
    $receivedRole3 === 'student' && !$hasFinances3,
    "Enforced Role: '$receivedRole3' (Financial data exposed: " . ($hasFinances3 ? 'YES' : 'NO') . ")"
);

// -------------------------------------------------------------------------
// TEST 4 — COACH -> SUPER ADMIN ESCALATION
// Authenticate as Coach.
// Send: X-VAVA-Role: admin
// Expected: Coach must remain a Coach. Super Admin data must NOT be returned.
// -------------------------------------------------------------------------
echo "\n--- TEST 4: Coach Role Escalation Attack ---\n";
$res4 = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role' => 'admin' // Escalation attempt!
], $cookieCoachA);

$receivedRole4 = $res4['json']['role'] ?? '';
$hasFinances4  = isset($res4['json']['financial']) || isset($res4['json']['finances']);
assertTest(
    "Coach cannot escalate to Super Admin via X-VAVA-Role",
    $receivedRole4 === 'coach' && !$hasFinances4,
    "Coach remains Coach: '$receivedRole4' (Financial oversight exposed: " . ($hasFinances4 ? 'YES' : 'NO') . ")"
);

// -------------------------------------------------------------------------
// TEST 5 — EMAIL MANIPULATION
// Authenticate as Coach A.
// Send: X-VAVA-Email: rauttaniya28@gmail.com (Coach B's email).
// Expected: Dashboard must remain associated with authenticated user.
// -------------------------------------------------------------------------
echo "\n--- TEST 5: Email Manipulation Attack ---\n";
$res5 = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'  => 'coach',
    'X-VAVA-Email' => 'rauttaniya28@gmail.com' // Attacker claiming Coach B's email!
], $cookieCoachA);

$returnedCoachId5 = $res5['json']['user']['coach_id'] ?? null;
assertTest(
    "Email header manipulation is ignored when session is active",
    $res5['code'] === 200 && $returnedCoachId5 === 100,
    "Resolved Coach ID: $returnedCoachId5 (Authenticated session user: 100)"
);

// -------------------------------------------------------------------------
// TEST 6 — COACH DATA ISOLATION (COACH A vs COACH B)
// -------------------------------------------------------------------------
echo "\n--- TEST 6: Coach A vs Coach B Data Isolation ---\n";
$cookieCoachB = establishSession('coach', 'rauttaniya28@gmail.com', 101, 'Tanya Raut');

$resCoachA = makeRequest("$baseUrl/server/dashboard.php", [], $cookieCoachA);
$resCoachB = makeRequest("$baseUrl/server/dashboard.php", [], $cookieCoachB);

$batchesA = array_column($resCoachA['json']['batches']['list'] ?? [], 'batch_id');
$batchesB = array_column($resCoachB['json']['batches']['list'] ?? [], 'batch_id');
$hasOverlap = !empty(array_intersect($batchesA, $batchesB));

assertTest(
    "Coach A and Coach B have strictly isolated batches",
    !empty($batchesA) && !empty($batchesB) && !$hasOverlap,
    "Coach A batches: [" . implode(',', $batchesA) . "], Coach B batches: [" . implode(',', $batchesB) . "] (Overlapping: " . ($hasOverlap ? 'YES' : 'NO') . ")"
);

// -------------------------------------------------------------------------
// TEST 7 — STUDENT DATA ISOLATION (STUDENT A vs STUDENT B)
// -------------------------------------------------------------------------
echo "\n--- TEST 7: Student A vs Student B Data Isolation ---\n";
$cookieStudentB = establishSession('student', 'teststudent4_178878652496@vavasports.local', 8, 'Test Student 4');

$resStudentA = makeRequest("$baseUrl/server/dashboard.php", [], $cookieStudentA);
$resStudentB = makeRequest("$baseUrl/server/dashboard.php", [], $cookieStudentB);

$studentIdA = $resStudentA['json']['user']['student_id'] ?? 0;
$batchIdA   = $resStudentA['json']['batch']['batch_id'] ?? 0;
$studentIdB = $resStudentB['json']['user']['student_id'] ?? 0;
$batchIdB   = $resStudentB['json']['batch']['batch_id'] ?? 0;

assertTest(
    "Student A and Student B have strictly isolated profile & batch scopes",
    $studentIdA === 3 && $batchIdA === 10 && $studentIdB === 8 && $batchIdB === 7,
    "Student A (ID $studentIdA, Batch $batchIdA) vs Student B (ID $studentIdB, Batch $batchIdB)"
);

// -------------------------------------------------------------------------
// TEST 8 — UNAUTHENTICATED FORGERY PROBES
// -------------------------------------------------------------------------
echo "\n--- TEST 8: Unauthenticated Forgery Probes ---\n";

// 8a. Forging Coach ID without email or session
$res8a = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'     => 'coach',
    'X-VAVA-Coach-ID' => '100'
]);
assertTest(
    "Unauthenticated request forging X-VAVA-Coach-ID is rejected",
    $res8a['code'] === 403,
    "HTTP Code: " . $res8a['code'] . " - " . ($res8a['json']['error'] ?? '')
);

// 8b. Forging Student ID without email or session
$res8b = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'       => 'student',
    'X-VAVA-Student-ID' => '3'
]);
assertTest(
    "Unauthenticated request forging X-VAVA-Student-ID is rejected",
    $res8b['code'] === 403,
    "HTTP Code: " . $res8b['code'] . " - " . ($res8b['json']['error'] ?? '')
);

// 8c. Coach email claiming Super Admin
$res8c = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'  => 'superadmin',
    'X-VAVA-Email' => 'chiragdnagvekar@gmail.com'
]);
assertTest(
    "Coach email attempting to claim Super Admin is rejected with 403",
    $res8c['code'] === 403,
    "HTTP Code: " . $res8c['code'] . " - " . ($res8c['json']['error'] ?? '')
);

// 8d. Student email claiming Super Admin
$res8d = makeRequest("$baseUrl/server/dashboard.php", [
    'X-VAVA-Role'  => 'superadmin',
    'X-VAVA-Email' => 'aarav.sharma@vavasports.local'
]);
assertTest(
    "Student email attempting to claim Super Admin is rejected with 403",
    $res8d['code'] === 403,
    "HTTP Code: " . $res8d['code'] . " - " . ($res8c['json']['error'] ?? '')
);

// -------------------------------------------------------------------------
// TEST 9 — SUPER ADMIN AUTHENTICATED ACCESS
// -------------------------------------------------------------------------
echo "\n--- TEST 9: Super Admin Authenticated Access ---\n";
$cookieAdmin = establishSession('admin', 'pavanbhosale212@gmail.com', 1, 'Pavan Bhosale');
$res9 = makeRequest("$baseUrl/server/dashboard.php", [], $cookieAdmin);

$adminRole = $res9['json']['role'] ?? '';
$hasKpis   = isset($res9['json']['kpis']['students']);
$hasFin    = isset($res9['json']['financial']);
$hasBatch  = isset($res9['json']['batches']);

assertTest(
    "Super Admin receives full academy metrics & financial dashboard",
    $res9['code'] === 200 && $adminRole === 'superadmin' && $hasKpis && $hasFin && $hasBatch,
    "Role: $adminRole, Students KPI present: " . ($hasKpis ? 'YES' : 'NO') . ", Financial data: " . ($hasFin ? 'YES' : 'NO')
);

echo "\n===================================================================\n";
echo "AUDIT SUMMARY: $passCount Passed, $failCount Failed\n";
echo "===================================================================\n";
