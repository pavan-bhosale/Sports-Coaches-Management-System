<?php
/**
 * VAVA Sports Academy - Fees Scheduler Service
 * 
 * Central service for processing due payment cycle notifications.
 * Strictly operates in the Asia/Kolkata (IST) timezone.
 */

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/twilio_config.php';

/**
 * Validates an array of raw schedule items [{date: 'YYYY-MM-DD', time: 'HH:MM'}].
 * Ensures valid format, future datetime in Asia/Kolkata, and no duplicate slots within cycle.
 */
function validateNotificationSchedules($rawSchedules) {
    if (!is_array($rawSchedules) || empty($rawSchedules)) {
        return [
            'valid' => false,
            'error' => 'At least one notification schedule is required.'
        ];
    }

    $nowTimestamp = time();
    $validated = [];
    $seenDatetimes = [];

    foreach ($rawSchedules as $idx => $item) {
        $num = $idx + 1;
        $date = trim($item['date'] ?? '');
        $time = trim($item['time'] ?? '');

        if (empty($date) || empty($time)) {
            return [
                'valid' => false,
                'error' => "Notification #$num is missing date or time."
            ];
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return [
                'valid' => false,
                'error' => "Notification #$num has an invalid date format. Expected YYYY-MM-DD."
            ];
        }

        $timeParsed = strtotime("$date $time");
        if ($timeParsed === false) {
            return [
                'valid' => false,
                'error' => "Notification #$num has an invalid time format."
            ];
        }

        if ($timeParsed <= $nowTimestamp) {
            return [
                'valid' => false,
                'error' => "Notification #$num ($date $time) is in the past. Scheduled time must be in the future."
            ];
        }

        $scheduledAt = date('Y-m-d H:i:s', $timeParsed);

        if (in_array($scheduledAt, $seenDatetimes)) {
            return [
                'valid' => false,
                'error' => "Duplicate notification schedule ($date $time) detected. Each notification must have a unique date and time."
            ];
        }

        $seenDatetimes[] = $scheduledAt;
        $validated[] = [
            'date'         => $date,
            'time'         => $time,
            'scheduled_at' => $scheduledAt
        ];
    }

    return [
        'valid'     => true,
        'schedules' => $validated
    ];
}

/**
 * Finds all due scheduled notifications and dispatches WhatsApp messages via Twilio.
 * 
 * Atomic lock guarantees that two concurrent worker runs cannot double-send a notification.
 */
function processDuePaymentNotifications($pdo) {
    date_default_timezone_set('Asia/Kolkata');
    $now = date('Y-m-d H:i:s');

    // 1. Fetch notifications where scheduled_at <= $now AND status = 'Scheduled'
    $stmt = $pdo->prepare("
        SELECT notification_id, fee_month, scheduled_at, total_students
        FROM vsa_payment_notifications
        WHERE status = 'Scheduled' AND scheduled_at <= ?
        ORDER BY scheduled_at ASC
    ");
    $stmt->execute([$now]);
    $dueNotifications = $stmt->fetchAll();

    $processed = [];

    foreach ($dueNotifications as $notif) {
        $notifId = intval($notif['notification_id']);
        $feeMonth = $notif['fee_month'];

        // 2. Atomic lock / claim: transition to 'Processing'
        $lockStmt = $pdo->prepare("
            UPDATE vsa_payment_notifications
            SET status = 'Processing'
            WHERE notification_id = ? AND status = 'Scheduled'
        ");
        $lockStmt->execute([$notifId]);
        if ($lockStmt->rowCount() === 0) {
            // Already claimed by another worker process
            continue;
        }

        // 3. Fetch active students belonging to this fee_month payment cycle
        $studentsStmt = $pdo->prepare("
            SELECT 
                s.student_id,
                s.student_name,
                s.whatsapp_number,
                s.student_phone
            FROM vsa_student_fees f
            INNER JOIN vsa_students s ON f.student_id = s.student_id
            WHERE f.fee_month = ? AND s.status = 'Active'
            ORDER BY s.student_id ASC
        ");
        $studentsStmt->execute([$feeMonth]);
        $students = $studentsStmt->fetchAll();

        $monthLabel = date('F Y', strtotime($feeMonth));
        $messageBody = "This is a reminder to pay this months fees to VAVA Sports, kindly complete the process till the due date";

        $sentCount = 0;
        $failedCount = 0;
        $firstError = null;

        // 4. Dispatch WhatsApp notification through existing Twilio function
        foreach ($students as $st) {
            $studentId = intval($st['student_id']);
            $phone = !empty($st['whatsapp_number']) ? $st['whatsapp_number'] : $st['student_phone'];
            $formattedPhone = formatTwilioWhatsAppNumber($phone);

            if (empty($formattedPhone)) {
                $failedCount++;
                if (!$firstError) {
                    $firstError = "Missing or malformed phone for student ID $studentId";
                }
                continue;
            }

            $sendResult = sendTwilioWhatsAppNotification(
                $formattedPhone,
                $messageBody,
                null,
                ['1' => $st['student_name'], '2' => $monthLabel],
                $studentId
            );

            if ($sendResult['success']) {
                $sentCount++;
            } else {
                $failedCount++;
                if (!$firstError) {
                    $firstError = $sendResult['error'] ?? 'Twilio dispatch failed';
                }
            }
        }

        // 5. Determine final status
        $finalStatus = 'Sent';
        if ($sentCount === 0 && $failedCount > 0) {
            $finalStatus = 'Failed';
        } elseif ($sentCount > 0 && $failedCount > 0) {
            $finalStatus = 'Partial';
        } elseif (count($students) === 0) {
            $finalStatus = 'Sent';
        }

        $updateStmt = $pdo->prepare("
            UPDATE vsa_payment_notifications
            SET 
                status = ?,
                sent_count = ?,
                failed_count = ?,
                error_message = ?,
                sent_at = NOW()
            WHERE notification_id = ?
        ");
        $updateStmt->execute([$finalStatus, $sentCount, $failedCount, $firstError, $notifId]);

        $processed[] = [
            'notification_id' => $notifId,
            'fee_month'       => $feeMonth,
            'scheduled_at'    => $notif['scheduled_at'],
            'status'          => $finalStatus,
            'total_students'  => count($students),
            'sent_count'      => $sentCount,
            'failed_count'    => $failedCount,
            'error_message'   => $firstError
        ];
    }

    return [
        'success'     => true,
        'server_time' => $now,
        'due_count'   => count($dueNotifications),
        'processed'   => $processed
    ];
}
