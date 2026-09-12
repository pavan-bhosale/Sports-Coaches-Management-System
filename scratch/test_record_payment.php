<?php
require_once 'server/db_connect.php';

// Record payment for fee_id 2 (Aarav Sharma)
$stmt = $pdo->prepare("
    UPDATE vsa_student_fees 
    SET payment_status = 'Paid',
        paid_amount = 1500.00,
        paid_at = NOW(),
        payment_method = 'Razorpay (UPI)',
        razorpay_order_id = 'order_test_90123',
        razorpay_payment_id = 'pay_test_881920'
    WHERE fee_id = 2
");
$stmt->execute();

// Record payment for fee_id 3 (Avi patle)
$stmt2 = $pdo->prepare("
    UPDATE vsa_student_fees 
    SET payment_status = 'Paid',
        paid_amount = 1500.00,
        paid_at = NOW(),
        payment_method = 'Razorpay (Card)',
        razorpay_order_id = 'order_test_90124',
        razorpay_payment_id = 'pay_test_881921'
    WHERE fee_id = 3
");
$stmt2->execute();

echo "Recorded payments for fee_id 2 and 3.\n";

// Query API again
$_GET['action'] = 'get_fees';
$_GET['month'] = '2026-09-01';
require 'server/fees.php';
?>
