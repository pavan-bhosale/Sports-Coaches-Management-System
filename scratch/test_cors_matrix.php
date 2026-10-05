<?php
/**
 * Test Matrix for VAVA Sports Dashboard API CORS & Authorization
 */

function testHttpRequest($url, $method = 'GET', $headers = []) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    
    $curlHeaders = [];
    foreach ($headers as $k => $v) {
        $curlHeaders[] = "$k: $v";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);
    
    $rawResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    
    $headerText = substr($rawResponse, 0, $headerSize);
    $body = substr($rawResponse, $headerSize);
    
    // Parse headers
    $parsedHeaders = [];
    foreach (explode("\r\n", $headerText) as $line) {
        if (strpos($line, ':') !== false) {
            list($hk, $hv) = explode(':', $line, 2);
            $parsedHeaders[strtolower(trim($hk))] = trim($hv);
        }
    }
    
    curl_close($ch);
    return [
        'code' => $httpCode,
        'headers' => $parsedHeaders,
        'body' => $body
    ];
}

$baseUrl = 'http://localhost/VAVA_sports/server/dashboard.php';
$testsPassed = 0;
$testsFailed = 0;

function assertCondition($name, $condition, $details = '') {
    global $testsPassed, $testsFailed;
    if ($condition) {
        echo "[PASS] $name\n";
        $testsPassed++;
    } else {
        echo "[FAIL] $name: $details\n";
        $testsFailed++;
    }
}

echo "===================================================================\n";
echo "1. TESTING PREFLIGHT (OPTIONS) REQUESTS\n";
echo "===================================================================\n";

// Test 1: OPTIONS from localhost:5500 (Live Server)
$res = testHttpRequest($baseUrl, 'OPTIONS', [
    'Origin' => 'http://127.0.0.1:5500',
    'Access-Control-Request-Method' => 'GET',
    'Access-Control-Request-Headers' => 'X-VAVA-Role, X-VAVA-Email'
]);
assertCondition(
    "Preflight for 127.0.0.1:5500 returns HTTP 200",
    $res['code'] === 200,
    "Got HTTP " . $res['code']
);
assertCondition(
    "Preflight for 127.0.0.1:5500 returns exact Origin",
    ($res['headers']['access-control-allow-origin'] ?? '') === 'http://127.0.0.1:5500',
    "Got: " . ($res['headers']['access-control-allow-origin'] ?? 'none')
);
assertCondition(
    "Preflight for 127.0.0.1:5500 includes credentials: true",
    ($res['headers']['access-control-allow-credentials'] ?? '') === 'true',
    "Got: " . ($res['headers']['access-control-allow-credentials'] ?? 'none')
);
assertCondition(
    "Preflight for 127.0.0.1:5500 includes Vary: Origin",
    ($res['headers']['vary'] ?? '') === 'Origin',
    "Got: " . ($res['headers']['vary'] ?? 'none')
);
assertCondition(
    "Preflight for 127.0.0.1:5500 includes X-VAVA headers in allowed headers",
    strpos($res['headers']['access-control-allow-headers'] ?? '', 'X-VAVA-Role') !== false,
    "Got: " . ($res['headers']['access-control-allow-headers'] ?? 'none')
);

// Test 2: OPTIONS from Hostinger production domain (https://vavasports.com)
$res = testHttpRequest($baseUrl, 'OPTIONS', [
    'Origin' => 'https://vavasports.com',
    'Access-Control-Request-Method' => 'GET',
    'Access-Control-Request-Headers' => 'X-VAVA-Role, X-VAVA-Email, X-VAVA-Coach-ID'
]);
assertCondition(
    "Preflight for https://vavasports.com returns HTTP 200",
    $res['code'] === 200,
    "Got HTTP " . $res['code']
);
assertCondition(
    "Preflight for https://vavasports.com returns exact Origin",
    ($res['headers']['access-control-allow-origin'] ?? '') === 'https://vavasports.com',
    "Got: " . ($res['headers']['access-control-allow-origin'] ?? 'none')
);
assertCondition(
    "Preflight for https://vavasports.com includes credentials: true",
    ($res['headers']['access-control-allow-credentials'] ?? '') === 'true',
    "Got: " . ($res['headers']['access-control-allow-credentials'] ?? 'none')
);
assertCondition(
    "Preflight for https://vavasports.com NEVER outputs wildcard (*)",
    ($res['headers']['access-control-allow-origin'] ?? '') !== '*',
    "Wildcard detected!"
);

// Test 3: OPTIONS from www.vavasports.com
$res = testHttpRequest($baseUrl, 'OPTIONS', [
    'Origin' => 'https://www.vavasports.com',
    'Access-Control-Request-Method' => 'GET'
]);
assertCondition(
    "Preflight for https://www.vavasports.com returns exact Origin & credentials",
    ($res['headers']['access-control-allow-origin'] ?? '') === 'https://www.vavasports.com' &&
    ($res['headers']['access-control-allow-credentials'] ?? '') === 'true',
    "Got: " . json_encode($res['headers'])
);

// Test 4: OPTIONS from Hostinger preview domain
$res = testHttpRequest($baseUrl, 'OPTIONS', [
    'Origin' => 'https://preview-123.hostingersite.com',
    'Access-Control-Request-Method' => 'GET'
]);
assertCondition(
    "Preflight for Hostinger preview domain allowed",
    ($res['headers']['access-control-allow-origin'] ?? '') === 'https://preview-123.hostingersite.com' &&
    ($res['headers']['access-control-allow-credentials'] ?? '') === 'true',
    "Got: " . json_encode($res['headers'])
);

// Test 5: OPTIONS from Malicious Unknown Origin (https://evil-attacker.example)
$res = testHttpRequest($baseUrl, 'OPTIONS', [
    'Origin' => 'https://evil-attacker.example',
    'Access-Control-Request-Method' => 'GET'
]);
assertCondition(
    "Preflight for evil-attacker.example is REJECTED (HTTP 403)",
    $res['code'] === 403,
    "Got HTTP " . $res['code']
);
assertCondition(
    "Preflight for evil-attacker.example does NOT return allow-origin header",
    empty($res['headers']['access-control-allow-origin']),
    "Leaked allow-origin: " . ($res['headers']['access-control-allow-origin'] ?? '')
);
assertCondition(
    "Preflight for evil-attacker.example does NOT return credentials header",
    empty($res['headers']['access-control-allow-credentials']),
    "Leaked credentials header!"
);

echo "\n===================================================================\n";
echo "2. TESTING GET REQUESTS WITH CORS HEADERS\n";
echo "===================================================================\n";

// Test 6: GET request with Hostinger Origin (https://vavasports.com) as Super Admin
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://vavasports.com',
    'X-VAVA-Role' => 'admin',
    'X-VAVA-Email' => 'pavanbhosale212@gmail.com'
]);
assertCondition(
    "GET with Hostinger Origin returns HTTP 200",
    $res['code'] === 200,
    "Got HTTP " . $res['code']
);
assertCondition(
    "GET with Hostinger Origin returns exact Origin header",
    ($res['headers']['access-control-allow-origin'] ?? '') === 'https://vavasports.com',
    "Got: " . ($res['headers']['access-control-allow-origin'] ?? 'none')
);
assertCondition(
    "GET with Hostinger Origin returns credentials: true",
    ($res['headers']['access-control-allow-credentials'] ?? '') === 'true',
    "Got: " . ($res['headers']['access-control-allow-credentials'] ?? 'none')
);
assertCondition(
    "GET with Hostinger Origin returns valid JSON with superadmin data",
    strpos($res['body'], '"role":"superadmin"') !== false && strpos($res['body'], '"financial"') !== false,
    "Body: " . substr($res['body'], 0, 200)
);

// Test 7: GET request with evil origin
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://attacker.com',
    'X-VAVA-Role' => 'admin',
    'X-VAVA-Email' => 'pavanbhosale212@gmail.com'
]);
assertCondition(
    "GET with attacker origin does NOT reflect attacker origin",
    empty($res['headers']['access-control-allow-origin']) || $res['headers']['access-control-allow-origin'] !== 'https://attacker.com',
    "Leaked origin: " . ($res['headers']['access-control-allow-origin'] ?? '')
);
assertCondition(
    "GET with attacker origin does NOT return credentials: true",
    empty($res['headers']['access-control-allow-credentials']),
    "Leaked credentials: " . ($res['headers']['access-control-allow-credentials'] ?? '')
);

echo "\n===================================================================\n";
echo "3. TESTING ALL ROLES DATA ISOLATION OVER APPROVED HOSTINGER ORIGIN\n";
echo "===================================================================\n";

// Test 8: Super Admin
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://vavasports.com',
    'X-VAVA-Role' => 'admin',
    'X-VAVA-Email' => 'pavanbhosale212@gmail.com'
]);
$data = json_decode($res['body'], true);
assertCondition(
    "Super Admin receives academy financial data",
    isset($data['data']['financial']) || isset($data['financial']),
    "Missing financial metrics in Super Admin view"
);

// Test 9: Coach Chirag
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://vavasports.com',
    'X-VAVA-Role' => 'coach',
    'X-VAVA-Email' => 'chiragdnagvekar@gmail.com',
    'X-VAVA-Coach-ID' => '100'
]);
$data = json_decode($res['body'], true);
assertCondition(
    "Coach role resolves successfully",
    ($data['role'] ?? '') === 'coach',
    "Role was: " . ($data['role'] ?? 'none') . " Body: " . substr($res['body'], 0, 150)
);
assertCondition(
    "Coach DOES NOT receive financial data",
    !isset($data['financial']) && !isset($data['data']['financial']),
    "Financial data leaked to coach!"
);

// Test 10: Student Aarav
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://vavasports.com',
    'X-VAVA-Role' => 'student',
    'X-VAVA-Email' => 'aarav.sharma@vavasports.local'
]);
$data = json_decode($res['body'], true);
assertCondition(
    "Student role resolves successfully",
    ($data['role'] ?? '') === 'student',
    "Role was: " . ($data['role'] ?? 'none') . " Body: " . substr($res['body'], 0, 150)
);

echo "\n===================================================================\n";
echo "4. TESTING SECURITY REGRESSION (FORGERY CHECKS OVER APPROVED ORIGIN)\n";
echo "===================================================================\n";

// Test 11: Fake Super Admin header from unverified email
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://vavasports.com',
    'X-VAVA-Role' => 'admin',
    'X-VAVA-Email' => 'impostor@attacker.com'
]);
assertCondition(
    "Unverified admin email is rejected with HTTP 403",
    $res['code'] === 403,
    "Got HTTP " . $res['code']
);

// Test 12: Fake coach email
$res = testHttpRequest($baseUrl, 'GET', [
    'Origin' => 'https://vavasports.com',
    'X-VAVA-Role' => 'coach',
    'X-VAVA-Email' => 'fakecoach@attacker.com',
    'X-VAVA-Coach-ID' => '100'
]);
assertCondition(
    "Unverified coach email is rejected with HTTP 403",
    $res['code'] === 403,
    "Got HTTP " . $res['code']
);

echo "\n===================================================================\n";
echo "TEST RESULTS: $testsPassed Passed, $testsFailed Failed\n";
echo "===================================================================\n";
if ($testsFailed > 0) {
    exit(1);
}
