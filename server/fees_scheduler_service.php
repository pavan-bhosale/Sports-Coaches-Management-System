<?php
/**
 * VAVA Sports Academy - Fees Scheduler Service
 * 
 * Central service for processing due payment cycle notifications.
 * Connects to Meta WhatsApp Cloud API (supporting Coexistence route).
 * Strictly operates in the Asia/Kolkata (IST) timezone.
 * 
 * Key guarantees:
 * - Paid and refunded invoices are strictly skipped.
 * - Explicit WhatsApp consent (s.whatsapp_consent = 1) is enforced.
 * - Stale 'Processing' jobs are recovered safely without duplicating messages.
 * - Atomic job claims prevent concurrent cron worker collisions.
 * - Each recipient outcome is tracked in vsa_student_notification_logs.
 */

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/meta_whatsapp_service.php';

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
                'error' => "Notification #$num ($date $time) is in the past. Scheduled time must be in the future (Asia/Kolkata IST)."
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
 * Recovers stale 'Processing' notification jobs that may have stalled due to worker crash or timeout.
 * 
 * @param PDO $pdo
 * @param int $timeoutMinutes
 * @return int Number of recovered jobs
 */
function recoverStaleProcessingJobs($pdo, $timeoutMinutes = 15) {
    $timeoutMinutes = max(5, intval($timeoutMinutes));

    // 1. Mark any recipient logs left in 'queued' (in-flight dispatch) during a crashed job
    // as 'failed' with error_code 'AMBIGUOUS_CRASH_OR_TIMEOUT' so a recovered job does NOT resend them.
    $stmtLogs = $pdo->prepare("
        UPDATE vsa_student_notification_logs l
        INNER JOIN vsa_payment_notifications n ON l.notification_id = n.notification_id
        SET l.status = 'failed',
            l.error_code = 'AMBIGUOUS_CRASH_OR_TIMEOUT',
            l.error_message = 'Worker process timed out or crashed while dispatch was in-flight. Resend prevented to avoid duplicate message. Manual review required.'
        WHERE n.status = 'Processing' 
          AND n.processing_started_at < (NOW() - INTERVAL ? MINUTE)
          AND l.status = 'queued'
    ");
    $stmtLogs->execute([$timeoutMinutes]);

    // 2. Reset the parent schedule job
    $stmt = $pdo->prepare("
        UPDATE vsa_payment_notifications
        SET status = 'Scheduled', 
            worker_id = NULL,
            error_message = CONCAT(COALESCE(error_message, ''), ' [Recovered from stale Processing]')
        WHERE status = 'Processing' 
          AND processing_started_at < (NOW() - INTERVAL ? MINUTE)
    ");
    $stmt->execute([$timeoutMinutes]);
    return $stmt->rowCount();
}

/**
 * Finds all due scheduled notifications and dispatches WhatsApp reminders via Meta WhatsApp Cloud API.
 * 
 * Atomic lock guarantees that two concurrent worker runs cannot double-send a notification.
 */
function processDuePaymentNotifications($pdo) {
    date_default_timezone_set('Asia/Kolkata');
    $now = date('Y-m-d H:i:s');
    $workerConfig = function_exists('getSchedulerWorkerConfig') ? getSchedulerWorkerConfig() : ['recovery_timeout_minutes' => 15];
    $workerId = 'worker_' . getmypid() . '_' . bin2hex(random_bytes(4));

    // 1. Recover stale processing jobs if any crashed previously
    $recoveredCount = recoverStaleProcessingJobs($pdo, $workerConfig['recovery_timeout_minutes'] ?? 15);

    // 2. Fetch notifications where scheduled_at <= $now AND status = 'Scheduled'
    $stmt = $pdo->prepare("
        SELECT notification_id, cycle_id, fee_month, scheduled_at, total_students
        FROM vsa_payment_notifications
        WHERE status = 'Scheduled' AND scheduled_at <= ?
        ORDER BY scheduled_at ASC
    ");
    $stmt->execute([$now]);
    $dueNotifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $processed = [];

    foreach ($dueNotifications as $notif) {
        $notifId = intval($notif['notification_id']);
        $feeMonth = $notif['fee_month'];

        // 3. Atomic lock / claim: transition to 'Processing' with worker_id and processing_started_at
        $lockStmt = $pdo->prepare("
            UPDATE vsa_payment_notifications
            SET status = 'Processing',
                processing_started_at = NOW(),
                worker_id = ?
            WHERE notification_id = ? AND status = 'Scheduled'
        ");
        $lockStmt->execute([$workerId, $notifId]);
        if ($lockStmt->rowCount() === 0) {
            // Already claimed by concurrent worker process
            continue;
        }

        // 4. Verify Payment Cycle Status: If cycle is cancelled, mark notification Cancelled
        $cycleStmt = $pdo->prepare("SELECT cycle_status FROM vsa_payment_cycles WHERE fee_month = ? LIMIT 1");
        $cycleStmt->execute([$feeMonth]);
        $cycleStatus = strtolower($cycleStmt->fetchColumn() ?: 'active');

        if ($cycleStatus === 'cancelled') {
            $cancelStmt = $pdo->prepare("
                UPDATE vsa_payment_notifications
                SET status = 'Cancelled',
                    error_message = 'Payment cycle was cancelled.',
                    sent_at = NOW()
                WHERE notification_id = ?
            ");
            $cancelStmt->execute([$notifId]);
            $processed[] = [
                'notification_id' => $notifId,
                'fee_month'       => $feeMonth,
                'status'          => 'Cancelled',
                'reason'          => 'Cycle cancelled'
            ];
            continue;
        }

        // 5. Fetch candidate student fee records that are ELIGIBLE for reminders
        // CRITICAL FIX: Strictly filter out students whose fee is already 'Paid' or 'Refunded',
        // and strictly exclude soft-deleted fee records.
        $studentsStmt = $pdo->prepare("
            SELECT 
                f.fee_id,
                f.student_id,
                f.fee_amount,
                f.due_date,
                f.payment_status,
                s.student_name,
                s.whatsapp_number,
                s.student_phone,
                s.whatsapp_consent,
                s.status as student_status
            FROM vsa_student_fees f
            INNER JOIN vsa_students s ON f.student_id = s.student_id
            WHERE f.fee_month = ? 
              AND s.status = 'Active'
              AND (f.deleted_at IS NULL)
              AND f.payment_status IN ('Unpaid', 'Overdue')
            ORDER BY s.student_id ASC
        ");
        $studentsStmt->execute([$feeMonth]);
        $eligibleStudents = $studentsStmt->fetchAll(PDO::FETCH_ASSOC);

        $monthLabel = date('F Y', strtotime($feeMonth));

        $sentCount = 0;
        $failedCount = 0;
        $skippedCount = 0;
        $firstError = null;

        // Prepared statements for recipient logs
        $checkLogStmt = $pdo->prepare("
            SELECT log_id, status, error_code FROM vsa_student_notification_logs 
            WHERE notification_id = ? AND fee_id = ? 
            LIMIT 1
        ");

        $insertLogStmt = $pdo->prepare("
            INSERT INTO vsa_student_notification_logs 
                (notification_id, fee_id, student_id, recipient_phone, provider, template_name, meta_message_id, status, error_code, error_message, dispatched_at)
            VALUES 
                (?, ?, ?, ?, 'meta', ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status),
                meta_message_id = VALUES(meta_message_id),
                error_code = VALUES(error_code),
                error_message = VALUES(error_message),
                dispatched_at = VALUES(dispatched_at)
        ");

        // Durable in-flight dispatch initialization (CRITICAL FIX FOR SCHED-01)
        $initDispatchStmt = $pdo->prepare("
            INSERT INTO vsa_student_notification_logs 
                (notification_id, fee_id, student_id, recipient_phone, provider, template_name, meta_message_id, status, error_code, error_message, dispatched_at)
            VALUES 
                (?, ?, ?, ?, 'meta', ?, NULL, 'queued', NULL, 'In-flight: Dispatch initiated to Meta API', NOW())
            ON DUPLICATE KEY UPDATE 
                status = IF(status IN ('sent', 'delivered', 'read'), status, 'queued'),
                error_message = IF(status IN ('sent', 'delivered', 'read'), error_message, 'In-flight: Re-attempt initiated')
        ");

        $updateSuccessStmt = $pdo->prepare("
            UPDATE vsa_student_notification_logs
            SET status = 'sent',
                meta_message_id = ?,
                error_code = NULL,
                error_message = NULL,
                dispatched_at = NOW()
            WHERE notification_id = ? AND fee_id = ? AND status IN ('queued', 'sent')
        ");

        $updateFailStmt = $pdo->prepare("
            UPDATE vsa_student_notification_logs
            SET status = 'failed',
                error_code = ?,
                error_message = ?
            WHERE notification_id = ? AND fee_id = ? AND status NOT IN ('delivered', 'read')
        ");

        $metaConfig = function_exists('getMetaWhatsAppConfig') ? getMetaWhatsAppConfig() : ['template_name' => 'fee_payment_reminder'];
        $templateName = $metaConfig['template_name'] ?? 'fee_payment_reminder';

        $recheckFeeStmt = $pdo->prepare("SELECT payment_status, deleted_at FROM vsa_student_fees WHERE fee_id = ? LIMIT 1");

        // 6. Iterate through each eligible student with individual state verification
        foreach ($eligibleStudents as $st) {
            $studentId = intval($st['student_id']);
            $feeId = intval($st['fee_id']);

            // Re-check database state immediately before send (guarantee no race condition with recent payments)
            $recheckFeeStmt->execute([$feeId]);
            $currentFee = $recheckFeeStmt->fetch(PDO::FETCH_ASSOC);

            if (!$currentFee || $currentFee['payment_status'] === 'Paid' || !empty($currentFee['deleted_at'])) {
                $skippedCount++;
                continue;
            }

            // Check if already dispatched or in-flight for this schedule run (idempotency & crash safety)
            $checkLogStmt->execute([$notifId, $feeId]);
            $existingLog = $checkLogStmt->fetch(PDO::FETCH_ASSOC);
            if ($existingLog) {
                if (in_array($existingLog['status'], ['sent', 'delivered', 'read'])) {
                    $sentCount++;
                    continue;
                }
                if ($existingLog['status'] === 'skipped') {
                    $skippedCount++;
                    continue;
                }
                if ($existingLog['status'] === 'queued') {
                    // In-flight attempt already exists; do NOT resend blindly to prevent duplicate message
                    $failedCount++;
                    if (!$firstError) {
                        $firstError = 'Dispatch attempt already in-flight or awaiting reconciliation.';
                    }
                    continue;
                }
                if ($existingLog['status'] === 'failed' && in_array($existingLog['error_code'], ['AMBIGUOUS_CRASH_OR_TIMEOUT', 'AMBIGUOUS_TIMEOUT'], true)) {
                    // Previous attempt timed out ambiguously; require manual review rather than resending
                    $failedCount++;
                    if (!$firstError) {
                        $firstError = 'In-flight attempt timed out previously; manual review required to prevent duplicate WhatsApp message.';
                    }
                    continue;
                }
            }

            // Explicit WhatsApp consent check (default 0 / not opted in)
            $hasConsent = intval($st['whatsapp_consent'] ?? 0) === 1;
            $rawPhone = !empty($st['whatsapp_number']) ? $st['whatsapp_number'] : $st['student_phone'];
            $formattedPhone = formatMetaWhatsAppNumber($rawPhone);

            if (!$hasConsent) {
                $skippedCount++;
                $err = 'Student has not explicitly opted in to WhatsApp reminders.';
                $insertLogStmt->execute([
                    $notifId, $feeId, $studentId, $rawPhone ?: 'none',
                    null, null, 'skipped', 'NO_CONSENT', $err, null
                ]);
                continue;
            }

            if (empty($formattedPhone)) {
                $failedCount++;
                $err = "Missing or malformed WhatsApp phone number for student ID $studentId.";
                if (!$firstError) {
                    $firstError = $err;
                }
                $insertLogStmt->execute([
                    $notifId, $feeId, $studentId, $rawPhone ?: 'invalid',
                    null, null, 'failed', 'INVALID_PHONE', $err, null
                ]);
                continue;
            }

            // Format dynamic template parameters: Student Name, Month Label, Amount Due, Due Date
            $amountFormatted = '₹' . number_format(floatval($st['fee_amount']), 0);
            $dueDateFormatted = date('d/m/Y', strtotime($st['due_date']));
            $templateParams = [
                $st['student_name'],
                $monthLabel,
                $amountFormatted,
                $dueDateFormatted
            ];

            // DURABLE PRE-DISPATCH RECORD (CRITICAL FIX FOR SCHED-01):
            // Persist the in-flight attempt BEFORE calling external Meta API
            $initDispatchStmt->execute([
                $notifId, $feeId, $studentId, $formattedPhone, $templateName
            ]);

            // Send via Meta WhatsApp Cloud API Service
            $metaResult = sendMetaWhatsAppTemplate(
                $formattedPhone,
                null,
                null,
                $templateParams,
                $studentId,
                $feeId
            );

            if ($metaResult['success']) {
                $sentCount++;
                $msgId = $metaResult['message_id'] ?? null;
                $updateSuccessStmt->execute([$msgId, $notifId, $feeId]);
            } else {
                $failedCount++;
                $errCode = $metaResult['error_code'] ?? 'META_DISPATCH_FAILED';
                $errDesc = $metaResult['error'] ?? 'WhatsApp dispatch failed';
                if (!$firstError) {
                    $firstError = $errDesc;
                }

                $isAmbiguous = ($errCode === 'CURL_ERROR' || strpos(strtolower($errDesc), 'timeout') !== false);
                $finalErrCode = $isAmbiguous ? 'AMBIGUOUS_TIMEOUT' : $errCode;
                $finalErrDesc = $isAmbiguous 
                    ? ($errDesc . ' [Ambiguous outcome: Meta may have received request. Resend blocked to prevent duplicate message.]')
                    : $errDesc;

                $updateFailStmt->execute([$finalErrCode, $finalErrDesc, $notifId, $feeId]);
            }
        }

        // 7. Determine final aggregate status for this schedule job
        $finalStatus = 'Sent';
        if ($sentCount === 0 && $failedCount > 0) {
            $finalStatus = 'Failed';
        } elseif ($sentCount > 0 && $failedCount > 0) {
            $finalStatus = 'Partial';
        } elseif (count($eligibleStudents) === 0) {
            // All invoices were paid or no active students
            $finalStatus = 'Sent';
            $firstError = 'All eligible student invoices were already paid or excluded.';
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
            'notification_id'   => $notifId,
            'fee_month'         => $feeMonth,
            'scheduled_at'      => $notif['scheduled_at'],
            'status'            => $finalStatus,
            'eligible_students' => count($eligibleStudents),
            'sent_count'        => $sentCount,
            'failed_count'      => $failedCount,
            'skipped_count'     => $skippedCount,
            'error_message'     => $firstError
        ];
    }

    return [
        'success'         => true,
        'server_time'     => $now,
        'worker_id'       => $workerId,
        'recovered_jobs'  => $recoveredCount,
        'due_count'       => count($dueNotifications),
        'processed'       => $processed
    ];
}
