CREATE DATABASE IF NOT EXISTS vava_sports;
USE vava_sports;

-- Batches Table
CREATE TABLE IF NOT EXISTS batches (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,
    batch_name VARCHAR(100) NOT NULL,
    batch_time VARCHAR(50),
    batch_location VARCHAR(150),
    sport VARCHAR(100),
    max_students INT DEFAULT 0,
    current_students INT DEFAULT 0,
    monthly_fee DECIMAL(10,2) DEFAULT 0.00,
    total_payment_due DECIMAL(12,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Coaches Table
CREATE TABLE IF NOT EXISTS coaches (
    coach_id INT AUTO_INCREMENT PRIMARY KEY,
    coach_name VARCHAR(100) NOT NULL,
    coach_email VARCHAR(100) UNIQUE NOT NULL,
    coach_phone VARCHAR(20),
    google_id VARCHAR(255) UNIQUE,
    coach_joined_date DATE,
    batch_id INT,
    coach_sport VARCHAR(100),
    max_students INT DEFAULT 0,
    current_students INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'Active',
    coach_dob DATE,
    coach_license VARCHAR(100),
    emergency_contact_name VARCHAR(100),
    emergency_contact_number VARCHAR(20),
    coach_address VARCHAR(255),
    coach_city VARCHAR(100),
    coach_postal_code VARCHAR(20),
    coach_photo VARCHAR(255),
    FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE SET NULL
);

-- Students Table
CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    student_email VARCHAR(100) UNIQUE NOT NULL,
    student_phone VARCHAR(20),
    google_id VARCHAR(255) UNIQUE,
    address VARCHAR(255),
    date_of_birth DATE,
    joined_date DATE,
    status VARCHAR(20) DEFAULT 'Active',
    parent_name VARCHAR(100) NOT NULL,
    gender VARCHAR(20) NOT NULL,
    blood_group VARCHAR(10) NOT NULL,
    branch_name VARCHAR(100) NOT NULL,
    batch_name VARCHAR(100),
    coach_name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    father_contact_number VARCHAR(20) NOT NULL,
    mother_contact_number VARCHAR(20),
    emergency_contact_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    student_photo VARCHAR(255),
    batch_id INT,
    coach_id INT,
    monthly_fee DECIMAL(10,2) DEFAULT 0.00,
    total_fee_due DECIMAL(12,2) DEFAULT 0.00,
    total_fee_paid DECIMAL(12,2) DEFAULT 0.00,
    fee_pending DECIMAL(12,2) DEFAULT 0.00,
    pending_months INT DEFAULT 0,
    payment_status VARCHAR(20) DEFAULT 'Pending',
    FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE SET NULL,
    FOREIGN KEY (coach_id) REFERENCES coaches(coach_id) ON DELETE SET NULL
);

-- Verified Users Table
CREATE TABLE IF NOT EXISTS superadmin (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_name VARCHAR(100) NOT NULL,
    admin_email VARCHAR(100) UNIQUE NOT NULL,
    admin_number VARCHAR(15),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
