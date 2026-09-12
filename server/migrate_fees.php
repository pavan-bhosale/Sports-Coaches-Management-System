<?php
require_once 'db_connect.php';

try {
    $sql = "
    CREATE TABLE IF NOT EXISTS vsa_student_fees (
        fee_id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        batch_id INT NOT NULL,
        fee_month DATE NOT NULL,
        due_date DATE NOT NULL,
        fee_amount DECIMAL(10,2) NOT NULL,
        payment_status ENUM('Unpaid','Paid','Overdue','Refunded') NOT NULL DEFAULT 'Unpaid',
        razorpay_order_id VARCHAR(255) NULL,
        razorpay_payment_id VARCHAR(255) NULL,
        payment_method VARCHAR(50) NULL,
        paid_amount DECIMAL(10,2) NULL,
        paid_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_student_month (student_id, fee_month),
        KEY idx_batch_id (batch_id),
        KEY idx_fee_month (fee_month),
        KEY idx_payment_status (payment_status),
        FOREIGN KEY (student_id) REFERENCES vsa_students(student_id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES vsa_batches(batch_id) ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ";

    $pdo->exec($sql);
    echo "SUCCESS: Table vsa_student_fees created successfully.\n";

    // Verify table structure
    $stmt = $pdo->query("DESCRIBE vsa_student_fees");
    print_r($stmt->fetchAll());
} catch (PDOException $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
?>
