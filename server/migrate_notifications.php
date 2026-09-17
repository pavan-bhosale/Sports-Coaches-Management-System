<?php
require_once __DIR__ . '/db_connect.php';

$sql = "CREATE TABLE IF NOT EXISTS `vsa_payment_notifications` (
  `notification_id` INT AUTO_INCREMENT PRIMARY KEY,
  `fee_month` DATE NOT NULL,
  `scheduled_at` DATETIME NOT NULL,
  `status` ENUM('Scheduled', 'Processing', 'Sent', 'Partial', 'Failed', 'Cancelled') NOT NULL DEFAULT 'Scheduled',
  `total_students` INT NOT NULL DEFAULT 0,
  `sent_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `error_message` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `sent_at` DATETIME NULL,
  INDEX `idx_fee_month` (`fee_month`),
  INDEX `idx_due_status` (`status`, `scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

try {
    $pdo->exec($sql);
    echo "TABLE_CREATED_SUCCESSFULLY\n";
} catch (PDOException $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
