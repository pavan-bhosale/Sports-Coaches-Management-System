<?php
/**
 * VAVA Sports Academy - Student Profile Security Audit & Test Matrix
 */
require_once __DIR__ . '/../server/db_connect.php';

echo "================================================================\n";
echo "VAVA SPORTS — STUDENT PROFILE SECURITY & ROLE-AWARE AUDIT\n";
echo "================================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest($name, $condition, $details = '') {
    global $passCount, $failCount;
    if ($condition) {
        echo "  [PASS] {$name}" . ($details ? " ({$details})" : "") . "\n";
        $passCount++;
    } else {
        echo "  [FAIL] {$name}" . ($details ? " ({$details})" : "") . "\n";
        $failCount++;
    }
}

// Helper to make a local HTTP request to server/students.php
function callStudentsApi($queryParams = [], $headers = [], $method = 'GET', $body = null, $cookies = []) {
    $url = 'http://localhost/VAVA_sports/server/students.php';
    if (!empty($queryParams)) {
        $url .= '?' . http_build_query($queryParams);
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

    $httpHeaders = [];
    foreach ($headers as $k => $v) {
        $httpHeaders[] = "{$k}: {$v}";
    }
    if ($body !== null) {
        $httpHeaders[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $httpHeaders);

    if (!empty($cookies)) {
        $cookieStr = '';
        foreach ($cookies as $k => $v) {
            $cookieStr .= "{$k}={$v}; ";
        }
        curl_setopt($ch, CURLOPT_COOKIE, rtrim($cookieStr, '; '));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode($response, true);
    return ['code' => $httpCode, 'raw' => $response, 'json' => $json];
}

// Helper to create an active PHP session for testing
function createSession($role, $email, $studentId = 0, $coachId = 0) {
    $ch = curl_init('http://localhost/VAVA_sports/scratch/session_helper.php');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'role' => $role,
        'email' => $email,
        'student_id' => $studentId,
        'coach_id' => $coachId
    ]));
    $res = curl_exec($ch);
    curl_close($ch);

    if (preg_match('/Set-Cookie:\s*PHPSESSID=([^;]+)/i', $res, $matches)) {
        return $matches[1];
    }
    return null;
}

// Create temporary session helper
file_put_contents(__DIR__ . '/session_helper.php', '<?php
session_start();
$_SESSION["user_role"] = $_POST["role"] ?? "";
$_SESSION["user_email"] = $_POST["email"] ?? "";
$_SESSION["student_id"] = intval($_POST["student_id"] ?? 0);
$_SESSION["coach_id"] = intval($_POST["coach_id"] ?? 0);
echo "OK";
');

// 1. Fetch Student A & Student B from database
$studentA = $pdo->query("SELECT * FROM vsa_students WHERE student_id = 3")->fetch(PDO::FETCH_ASSOC);
$studentB = $pdo->query("SELECT * FROM vsa_students WHERE student_id = 4")->fetch(PDO::FETCH_ASSOC);

echo "Target Test Identities:\n";
echo "  Student A: ID #{$studentA['student_id']} - {$studentA['student_name']} ({$studentA['student_email']})\n";
echo "  Student B: ID #{$studentB['student_id']} - {$studentB['student_name']} ({$studentB['student_email']})\n\n";

$sessionA = createSession('student', $studentA['student_email'], $studentA['student_id']);
$sessionB = createSession('student', $studentB['student_email'], $studentB['student_id']);
$sessionAdmin = createSession('admin', 'admin@vavasports.com', 0, 0);

// TEST 1: Login as Student A. Open profile. Expected: Student A profile.
echo "--- TEST 1: Student A opens own profile ---\n";
$res1 = callStudentsApi([], [], 'GET', null, ['PHPSESSID' => $sessionA]);
assertTest("Student A returns success", $res1['code'] === 200 && ($res1['json']['success'] ?? false) === true);
assertTest("Student A profile data returned", ($res1['json']['student']['student_id'] ?? 0) == $studentA['student_id'] && ($res1['json']['student']['student_name'] ?? '') === $studentA['student_name']);

// TEST 2: Login as Student B. Open profile. Expected: Student B profile.
echo "\n--- TEST 2: Student B opens own profile ---\n";
$res2 = callStudentsApi([], [], 'GET', null, ['PHPSESSID' => $sessionB]);
assertTest("Student B returns success", $res2['code'] === 200 && ($res2['json']['success'] ?? false) === true);
assertTest("Student B profile data returned", ($res2['json']['student']['student_id'] ?? 0) == $studentB['student_id'] && ($res2['json']['student']['student_name'] ?? '') === $studentB['student_name']);

// TEST 3: Student A modifies query student ID to Student B. Expected: No Student B data (returns Student A data or rejects).
echo "\n--- TEST 3: Student A tampers with query param ?id=4 (Student B) ---\n";
$res3 = callStudentsApi(['id' => $studentB['student_id']], [], 'GET', null, ['PHPSESSID' => $sessionA]);
assertTest("Response does NOT return Student B data", ($res3['json']['student']['student_id'] ?? 0) != $studentB['student_id'], "Returned ID: " . ($res3['json']['student']['student_id'] ?? 'none'));
assertTest("Response strictly returns Student A data", ($res3['json']['student']['student_id'] ?? 0) == $studentA['student_id']);

// TEST 4: Student A sends: X-VAVA-Student-ID: Student B. Expected: No Student B data.
echo "\n--- TEST 4: Student A sends spoofed X-VAVA-Student-ID: 4 ---\n";
$res4 = callStudentsApi([], ['X-VAVA-Student-ID' => (string)$studentB['student_id'], 'X-VAVA-Email' => $studentB['student_email']], 'GET', null, ['PHPSESSID' => $sessionA]);
assertTest("Response does NOT return Student B data", ($res4['json']['student']['student_id'] ?? 0) != $studentB['student_id']);
assertTest("Session overrides spoofed headers to return Student A", ($res4['json']['student']['student_id'] ?? 0) == $studentA['student_id']);

// TEST 5: Student sends: X-VAVA-Role: Super Admin. Expected: Student remains Student.
echo "\n--- TEST 5: Student A attempts role escalation via X-VAVA-Role: admin ---\n";
$res5 = callStudentsApi(['id' => $studentB['student_id']], ['X-VAVA-Role' => 'admin'], 'GET', null, ['PHPSESSID' => $sessionA]);
assertTest("Role escalation blocked: Student cannot view Student B", ($res5['json']['student']['student_id'] ?? 0) != $studentB['student_id']);
assertTest("Session role 'student' enforced, returning Student A", ($res5['json']['student']['student_id'] ?? 0) == $studentA['student_id']);

// TEST 6: Unauthenticated request attempts to retrieve a student profile. Expected: 401 Authentication required.
echo "\n--- TEST 6: Unauthenticated request to retrieve a student profile ---\n";
$res6 = callStudentsApi(['id' => $studentA['student_id']], [], 'GET');
assertTest("Unauthenticated request rejected", $res6['code'] === 401 || $res6['code'] === 403, "HTTP Code: {$res6['code']}");

// TEST 7: Super Admin requests Student A. Expected: Student A profile.
echo "\n--- TEST 7: Super Admin requests Student A (?id=3) ---\n";
$res7 = callStudentsApi(['id' => $studentA['student_id']], [], 'GET', null, ['PHPSESSID' => $sessionAdmin]);
assertTest("Super Admin successfully retrieves Student A", $res7['code'] === 200 && ($res7['json']['student']['student_id'] ?? 0) == $studentA['student_id']);

// TEST 8: Super Admin requests Student B. Expected: Student B profile.
echo "\n--- TEST 8: Super Admin requests Student B (?id=4) ---\n";
$res8 = callStudentsApi(['id' => $studentB['student_id']], [], 'GET', null, ['PHPSESSID' => $sessionAdmin]);
assertTest("Super Admin successfully retrieves Student B", $res8['code'] === 200 && ($res8['json']['student']['student_id'] ?? 0) == $studentB['student_id']);

// TEST 9: Student attempts to view coach notes (action=get_note). Expected: 403 Forbidden.
echo "\n--- TEST 9: Student attempts to access private coach notes ---\n";
$res9 = callStudentsApi(['action' => 'get_note', 'student_id' => $studentA['student_id']], [], 'GET', null, ['PHPSESSID' => $sessionA]);
assertTest("Student blocked from private notes (403)", $res9['code'] === 403);

// TEST 10: Student attempts to upload/modify photo via POST. Expected: 403 Forbidden.
echo "\n--- TEST 10: Student attempts administrative action (POST upload_photo) ---\n";
$res10 = callStudentsApi([], [], 'POST', ['action' => 'upload_photo', 'student_id' => $studentA['student_id'], 'image_data' => 'dummy'], ['PHPSESSID' => $sessionA]);
assertTest("Student blocked from POST modifications (403)", $res10['code'] === 403);

// Clean up helper
@unlink(__DIR__ . '/session_helper.php');

echo "\n================================================================\n";
echo "SECURITY AUDIT FINISHED: {$passCount} Passed, {$failCount} Failed\n";
echo "================================================================\n";
exit($failCount === 0 ? 0 : 1);
