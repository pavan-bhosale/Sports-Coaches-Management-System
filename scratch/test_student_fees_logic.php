<?php
require_once __DIR__ . '/../server/db_connect.php';

function testStudentFeesData($pdo, $studentId) {
    $stFeesStmt = $pdo->prepare("
        SELECT 
            fee_id,
            student_id,
            batch_id,
            fee_month,
            due_date,
            fee_amount,
            payment_status,
            razorpay_order_id,
            razorpay_payment_id,
            payment_method,
            paid_amount,
            paid_at
        FROM vsa_student_fees
        WHERE student_id = ?
        ORDER BY fee_month ASC, fee_id ASC
    ");
    $stFeesStmt->execute([$studentId]);
    $rawFeeRows = $stFeesStmt->fetchAll(PDO::FETCH_ASSOC);

    $currentMonthDate = date('Y-m-01');
    $currentMonthLabel = date('F Y');
    $currentMonthShort = strtoupper(date('M'));
    $currentMonthName = date('F');

    $totalExpectedMonths = count($rawFeeRows);
    $paidMonthsCount = 0;
    $dueMonthsCount = 0;
    $monthlyRecords = [];
    $currentMonthRecord = null;

    foreach ($rawFeeRows as $f) {
        $isPaid = ($f['payment_status'] === 'Paid');
        if ($isPaid) {
            $paidMonthsCount++;
        } else {
            $dueMonthsCount++;
        }

        $feeMonthVal = $f['fee_month'];
        $isCurMonth = ($feeMonthVal === $currentMonthDate);

        $monthObj = [
            'fee_id'              => intval($f['fee_id']),
            'fee_month'           => $feeMonthVal,
            'month_name'          => date('F', strtotime($feeMonthVal)),
            'month_short'         => strtoupper(date('M', strtotime($feeMonthVal))),
            'year'                => date('Y', strtotime($feeMonthVal)),
            'month_label'         => date('F Y', strtotime($feeMonthVal)),
            'due_date'            => date('d/m/Y', strtotime($f['due_date'])),
            'fee_amount'          => floatval($f['fee_amount']),
            'status'              => $isPaid ? 'PAID' : 'DUE',
            'raw_status'          => $f['payment_status'],
            'is_current_month'    => $isCurMonth,
            'paid_at'             => $f['paid_at'] ? date('d M Y, h:i A', strtotime($f['paid_at'])) : null,
            'paid_date_formatted' => $f['paid_at'] ? date('d M Y', strtotime($f['paid_at'])) : null,
            'paid_amount'         => ($f['paid_amount'] !== null && $f['paid_amount'] !== '') ? floatval($f['paid_amount']) : null,
            'payment_method'      => !empty($f['payment_method']) ? $f['payment_method'] : null,
            'payment_reference'   => !empty($f['razorpay_payment_id']) ? $f['razorpay_payment_id'] : null,
            'order_id'            => !empty($f['razorpay_order_id']) ? $f['razorpay_order_id'] : null
        ];

        if ($isCurMonth) {
            $currentMonthRecord = $monthObj;
        }

        $monthlyRecords[] = $monthObj;
    }

    $currentMonthStatus = 'Not Applicable';
    $currentMonthStatusText = 'No record for current month';
    if ($currentMonthRecord !== null) {
        if ($currentMonthRecord['status'] === 'PAID') {
            $currentMonthStatus = 'PAID';
            $currentMonthStatusText = '✓ Paid';
        } else {
            $currentMonthStatus = 'DUE';
            $currentMonthStatusText = '✕ Payment Due';
        }
    }

    return [
        'has_fees'             => ($totalExpectedMonths > 0),
        'total_expected'       => $totalExpectedMonths,
        'paid_count'           => $paidMonthsCount,
        'due_count'            => $dueMonthsCount,
        'percentage_paid'      => ($totalExpectedMonths > 0) ? round(($paidMonthsCount / $totalExpectedMonths) * 100) : 0,
        'current_month'        => [
            'date'             => $currentMonthDate,
            'label'            => $currentMonthLabel,
            'name'             => $currentMonthName,
            'short'            => $currentMonthShort,
            'has_record'       => ($currentMonthRecord !== null),
            'status'           => $currentMonthStatus,
            'status_text'      => $currentMonthStatusText
        ],
        'months'               => $monthlyRecords
    ];
}

echo "=== TEST STUDENT 3 (AARAV) ===\n";
print_r(testStudentFeesData($pdo, 3));

echo "\n=== TEST STUDENT WITH 0 RECORDS (ID 99999) ===\n";
print_r(testStudentFeesData($pdo, 99999));
