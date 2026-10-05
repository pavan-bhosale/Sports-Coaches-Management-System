<?php
function testEndpoint($role, $email, $extraHeaders = []) {
    echo "========================================================\n";
    echo "TESTING: Role='$role', Email='$email'\n";
    $url = 'http://localhost/VAVA_sports/server/dashboard.php';
    
    $headers = [
        "X-VAVA-Role: $role",
        "X-VAVA-Email: $email",
        "Content-Type: application/json"
    ];
    foreach ($extraHeaders as $h) {
        $headers[] = $h;
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    echo "HTTP Status: $httpCode\n";
    $json = json_decode($response, true);
    if ($json) {
        echo "Success: " . ($json['success'] ? 'true' : 'false') . "\n";
        echo "Role in response: " . ($json['role'] ?? 'none') . "\n";
        if (isset($json['error'])) echo "Error: {$json['error']}\n";
        if (isset($json['financial'])) echo "HAS FINANCIAL DATA: YES (Amount: " . json_encode($json['financial']['collected_this_month']) . ")\n";
        else echo "HAS FINANCIAL DATA: NO\n";
        if (isset($json['kpis'])) echo "KPIs: " . json_encode($json['kpis']) . "\n";
        if (isset($json['batch'])) echo "Batch: " . json_encode($json['batch']) . "\n";
        if (isset($json['batches'])) echo "Batches count: " . count($json['batches']['list'] ?? []) . "\n";
        if (isset($json['students'])) echo "Students count: " . count($json['students']['list'] ?? []) . "\n";
        if (isset($json['attendance']['seven_day_trend'])) echo "Trend dates count: " . count($json['attendance']['seven_day_trend']) . "\n";
    } else {
        echo "Raw Response:\n" . substr($response, 0, 500) . "\n";
    }
}

// 1. Super Admin
testEndpoint('admin', 'pavanbhosale212@gmail.com');

// 2. Coach A (Chirag Nagvekar - Coach 100)
testEndpoint('coach', 'chiragdnagvekar@gmail.com');

// 3. Coach B (Tanya Raut - Coach 101)
testEndpoint('coach', 'rauttaniya28@gmail.com');

// 4. Student A (Aarav Sharma - Student 3)
testEndpoint('student', 'aarav.sharma@vavasports.local');

// 5. Student B (Test Student 4 - Student 8)
testEndpoint('student', 'teststudent4_178878652496@vavasports.local');

// 6. Security Test: Coach requesting Super Admin
testEndpoint('superadmin', 'chiragdnagvekar@gmail.com');

// 7. Security Test: Student requesting Super Admin
testEndpoint('superadmin', 'aarav.sharma@vavasports.local');

// 8. Security Test: Student requesting Coach
testEndpoint('coach', 'aarav.sharma@vavasports.local');

// 9. Security Test: Coach requesting another coach's data via spoofed header
testEndpoint('coach', 'chiragdnagvekar@gmail.com', ['X-VAVA-Coach-ID: 103']);

// 10. Security Test: Student requesting another student's data via query param
testEndpoint('student', 'aarav.sharma@vavasports.local', ['X-VAVA-Student-ID: 8']);
