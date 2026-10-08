-- ==============================================================================
-- VAVA Sports Academy - Phase 2 Schema & Identity Normalization
-- ==============================================================================

-- 1. Unified Users Table
CREATE TABLE IF NOT EXISTS vsa_users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    display_name VARCHAR(150) DEFAULT '',
    google_subject_id VARCHAR(255) NULL,
    status ENUM('Active', 'Inactive', 'Suspended') DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_email (email),
    UNIQUE KEY uq_user_google_sub (google_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Unified User Roles Relationship Table
CREATE TABLE IF NOT EXISTS vsa_user_roles (
    role_mapping_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('admin', 'coach', 'student') NOT NULL,
    entity_id INT NOT NULL,
    is_primary TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_role (user_id, role),
    INDEX idx_role_entity (role, entity_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES vsa_users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
