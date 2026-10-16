<?php
/**
 * VAVA Sports Academy - Database Migration: Fees & Meta WhatsApp v2
 * 
 * Safely adds:
 * 1. vsa_payment_cycles (stable cycle lifecycle)
 * 2. cycle_id & deleted_at to vsa_student_fees (soft-delete / cancellation)
 * 3. cycle_id, processing_started_at, worker_id to vsa_payment_notifications
 * 4. vsa_student_notification_logs (granular per-recipient tracking)
 * 5. whatsapp_consent (explicit opt-in consent tracking) to vsa_students
 * 
 * Completely idempotent and non-destructive.
 */

require_once __DIR__ . '/db_connect.php';

echo "========================================================\n";
echo "VAVA SPORTS ACADEMY — DATABASE MIGRATION (FEES & META WA v2)\n";
echo "========================================================\n\n";

function columnExists($pdo, $table, $column) {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ? 
          AND COLUMN_NAME = ?
    ");
    $stmt->execute([$table, $column]);
    return intval($stmt->fetchColumn() ?: 0) > 0;
}

try {
    $pdo->beginTransaction();

    // ── 1. Create vsa_payment_cycles Table ───────────────────────────────────
    echo "1. Checking table 'vsa_payment_cycles'...\n";
    $sqlCycles = "
    CREATE TABLE IF NOT EXISTS `vsa_payment_cycles` (
        `cycle_id` INT AUTO_INCREMENT PRIMARY KEY,
        `fee_month` DATE NOT NULL UNIQUE,
        `cycle_status` ENUM('Active', 'Archived', 'Cancelled') NOT NULL DEFAULT 'Active',
        `created_by` INT NULL,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `cancelled_at` DATETIME NULL,
        INDEX `idx_cycle_month` (`fee_month`),
        INDEX `idx_cycle_status` (`cycle_status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlCycles);
    echo "   [OK] Table 'vsa_payment_cycles' verified.\n";

    // Backfill distinct fee_month from existing fees AND historical notification schedules (DB-01)
    // Normalizes fee_month to YYYY-MM-01 and ensures no historical schedules are orphaned.
    $pdo->exec("
        INSERT IGNORE INTO `vsa_payment_cycles` (`fee_month`, `cycle_status`)
        SELECT DISTINCT DATE_FORMAT(`fee_month`, '%Y-%m-01') AS `fee_month`, 'Active'
        FROM (
            SELECT `fee_month` FROM `vsa_student_fees` WHERE `fee_month` IS NOT NULL AND `fee_month` != '0000-00-00'
            UNION
            SELECT `fee_month` FROM `vsa_payment_notifications` WHERE `fee_month` IS NOT NULL AND `fee_month` != '0000-00-00'
        ) AS distinct_months
        WHERE `fee_month` IS NOT NULL
    ");
    echo "   [OK] Backfilled existing fee cycles into 'vsa_payment_cycles' (normalized from fees & schedules).\n";

    // ── 2. Alter vsa_student_fees Table ──────────────────────────────────────
    echo "2. Checking columns on 'vsa_student_fees'...\n";
    if (!columnExists($pdo, 'vsa_student_fees', 'cycle_id')) {
        $pdo->exec("ALTER TABLE `vsa_student_fees` ADD COLUMN `cycle_id` INT NULL AFTER `student_id`, ADD INDEX `idx_cycle_id` (`cycle_id`)");
        echo "   [OK] Added 'cycle_id' column to 'vsa_student_fees'.\n";
    }
    if (!columnExists($pdo, 'vsa_student_fees', 'deleted_at')) {
        $pdo->exec("ALTER TABLE `vsa_student_fees` ADD COLUMN `deleted_at` DATETIME NULL AFTER `updated_at`");
        echo "   [OK] Added 'deleted_at' column to 'vsa_student_fees'.\n";
    }

    // Backfill cycle_id on student fees with date normalization
    $pdo->exec("
        UPDATE `vsa_student_fees` f
        JOIN `vsa_payment_cycles` c ON DATE_FORMAT(f.fee_month, '%Y-%m-01') = c.fee_month
        SET f.cycle_id = c.cycle_id
        WHERE f.cycle_id IS NULL
    ");
    echo "   [OK] Synchronized 'cycle_id' on 'vsa_student_fees'.\n";

    // ── 3. Alter vsa_payment_notifications Table ─────────────────────────────
    echo "3. Checking columns on 'vsa_payment_notifications'...\n";
    if (!columnExists($pdo, 'vsa_payment_notifications', 'cycle_id')) {
        $pdo->exec("ALTER TABLE `vsa_payment_notifications` ADD COLUMN `cycle_id` INT NULL AFTER `notification_id`, ADD INDEX `idx_notif_cycle_id` (`cycle_id`)");
        echo "   [OK] Added 'cycle_id' column to 'vsa_payment_notifications'.\n";
    }
    if (!columnExists($pdo, 'vsa_payment_notifications', 'processing_started_at')) {
        $pdo->exec("ALTER TABLE `vsa_payment_notifications` ADD COLUMN `processing_started_at` DATETIME NULL AFTER `scheduled_at`");
        echo "   [OK] Added 'processing_started_at' column to 'vsa_payment_notifications'.\n";
    }
    if (!columnExists($pdo, 'vsa_payment_notifications', 'worker_id')) {
        $pdo->exec("ALTER TABLE `vsa_payment_notifications` ADD COLUMN `worker_id` VARCHAR(100) NULL AFTER `processing_started_at`");
        echo "   [OK] Added 'worker_id' column to 'vsa_payment_notifications'.\n";
    }

    // Backfill cycle_id on notifications with date normalization
    $pdo->exec("
        UPDATE `vsa_payment_notifications` n
        JOIN `vsa_payment_cycles` c ON DATE_FORMAT(n.fee_month, '%Y-%m-01') = c.fee_month
        SET n.cycle_id = c.cycle_id
        WHERE n.cycle_id IS NULL
    ");
    echo "   [OK] Synchronized 'cycle_id' on 'vsa_payment_notifications'.\n";

    // ── 4. Create vsa_student_notification_logs Table ────────────────────────
    echo "4. Checking table 'vsa_student_notification_logs'...\n";
    $sqlLogs = "
    CREATE TABLE IF NOT EXISTS `vsa_student_notification_logs` (
        `log_id` INT AUTO_INCREMENT PRIMARY KEY,
        `notification_id` INT NOT NULL,
        `fee_id` INT NOT NULL,
        `student_id` INT NOT NULL,
        `recipient_phone` VARCHAR(30) NOT NULL,
        `provider` VARCHAR(30) NOT NULL DEFAULT 'meta',
        `template_name` VARCHAR(100) NULL,
        `meta_message_id` VARCHAR(255) NULL,
        `status` ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'skipped') NOT NULL DEFAULT 'queued',
        `error_code` VARCHAR(50) NULL,
        `error_message` TEXT NULL,
        `dispatched_at` DATETIME NULL,
        `delivered_at` DATETIME NULL,
        `read_at` DATETIME NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_notif_fee` (`notification_id`, `fee_id`),
        INDEX `idx_meta_msg` (`meta_message_id`),
        INDEX `idx_student_status` (`student_id`, `status`),
        INDEX `idx_fee_id` (`fee_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($sqlLogs);
    echo "   [OK] Table 'vsa_student_notification_logs' verified.\n";

    // ── 5. Alter vsa_students Table for WhatsApp Consent ─────────────────────
    echo "5. Checking consent columns on 'vsa_students'...\n";
    if (!columnExists($pdo, 'vsa_students', 'whatsapp_consent')) {
        $pdo->exec("ALTER TABLE `vsa_students` ADD COLUMN `whatsapp_consent` TINYINT(1) NOT NULL DEFAULT 0 AFTER `whatsapp_number`");
        echo "   [OK] Added 'whatsapp_consent' column (default 0 / not opted in).\n";
    }
    if (!columnExists($pdo, 'vsa_students', 'whatsapp_consent_source')) {
        $pdo->exec("ALTER TABLE `vsa_students` ADD COLUMN `whatsapp_consent_source` VARCHAR(100) NULL AFTER `whatsapp_consent`");
        echo "   [OK] Added 'whatsapp_consent_source' column.\n";
    }
    if (!columnExists($pdo, 'vsa_students', 'whatsapp_consent_updated_at')) {
        $pdo->exec("ALTER TABLE `vsa_students` ADD COLUMN `whatsapp_consent_updated_at` DATETIME NULL AFTER `whatsapp_consent_source`");
        echo "   [OK] Added 'whatsapp_consent_updated_at' column.\n";
    }

    if ($pdo->inTransaction()) {
        $pdo->commit();
    }
    echo "\n>>> MIGRATION COMPLETED SUCCESSFULLY. ALL CHECKS PASSED. <<<\n";

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "\n[ERROR] Migration aborted: " . $e->getMessage() . "\n";
    exit(1);
}
