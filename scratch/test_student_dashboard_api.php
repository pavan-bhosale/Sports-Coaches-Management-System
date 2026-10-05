<?php
require_once __DIR__ . '/../server/db_connect.php';

// Simulate student session for Aarav Sharma (student_id = 3, student_email = aarav.sharma@example.com)
session_start();
$_SESSION['user_role'] = 'student';
$_SESSION['user_email'] = 'aarav.sharma@example.com';
$_SESSION['student_id'] = 3;

// Capture output of server/dashboard.php
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
require __DIR__ . '/../server/dashboard.php';
$output = ob_get_clean();

$json = json_decode($output, true);
echo "=== DASHBOARD RESPONSE FOR AARAV SHARMA ===\n";
echo "Success: " . ($json['success'] ? 'true' : 'false') . "\n";
echo "Role: " . ($json['role'] ?? 'none') . "\n";
echo "Student ID: " . ($json['user']['student_id'] ?? 'none') . "\n";
echo "KPIs:\n";
print_r($json['kpis']);
echo "Fees Summary:\n";
echo "Has fees: " . ($json['fees']['has_fees'] ? 'true' : 'false') . "\n";
echo "Total Expected: " . $json['fees']['total_expected'] . "\n";
echo "Paid: " . $json['fees']['paid_count'] . "\n";
echo "Due: " . $json['fees']['due_count'] . "\n";
echo "Current Month: " . json_encode($json['fees']['current_month']) . "\n";
echo "Months Count: " . count($json['fees']['months']) . "\n";
echo "Months List:\n";
foreach ($json['fees']['months'] as $m) {
    echo "  - {$m['month_label']}: {$m['status']} (Due: {$m['due_date']}, Amount: ₹{$m['fee_amount']}" . 
         ($m['status'] === 'PAID' ? ", Paid At: {$m['paid_at']}, Method: {$m['payment_method']}, Ref: {$m['payment_reference']}" : "") . ")\n";
}
