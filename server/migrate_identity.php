<?php
/**
 * VAVA Sports Academy - Unified User Identity Architecture Migration
 * 
 * Safely creates vsa_users and vsa_user_roles tables and maps existing
 * Super Admin, Coach, and Student identities WITHOUT deleting or altering
 * existing entity records, foreign keys, or primary keys.
 */

require_once __DIR__ . '/db_connect.php';

// Security guard: CLI execution is permitted; Web execution strictly requires Super Admin session
if (php_sapi_name() !== 'cli') {
    require_once __DIR__ . '/auth_helper.php';
    requireAuthSession($pdo, ['admin']);
    header('Content-Type: text/plain; charset=utf-8');
}

function normalizeUserEmail($email) {
    if (empty($email)) return '';
    $clean = strtolower(trim($email));
    $clean = str_replace(["\r", "\n", "\t"], '', $clean);
    return trim($clean);
}

echo "========================================================\n";
echo "VAVA SPORTS — IDENTITY ARCHITECTURE MIGRATION\n";
echo "========================================================\n\n";

// 1. Record counts before migration
$tablesToVerify = [
    'vsa_superadmin',
    'vsa_coaches',
    'vsa_students',
    'vsa_batches',
    'vsa_attendance',
    'vsa_student_fees',
    'vsa_inventory',
    'vsa_activity_log',
    'vsa_payment_notifications'
];

$countsBefore = [];
foreach ($tablesToVerify as $t) {
    $countsBefore[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
    echo sprintf("Table %-28s: %d records before\n", $t, $countsBefore[$t]);
}

// 2. Create vsa_users and vsa_user_roles tables
echo "\nCreating vsa_users and vsa_user_roles tables...\n";

$pdo->exec("
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
");

$pdo->exec("
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
");

echo "Tables verified/created successfully.\n\n";

// 3. Migrate identities idempotently
$pdo->beginTransaction();

try {
    $getUserStmt = $pdo->prepare("SELECT user_id, display_name, google_subject_id FROM vsa_users WHERE email = ? LIMIT 1");
    $insertUserStmt = $pdo->prepare("INSERT INTO vsa_users (email, display_name, google_subject_id, status) VALUES (?, ?, ?, 'Active')");
    $updateUserStmt = $pdo->prepare("UPDATE vsa_users SET display_name = COALESCE(NULLIF(?, ''), display_name), google_subject_id = COALESCE(NULLIF(?, ''), google_subject_id) WHERE user_id = ?");
    
    $getRoleStmt = $pdo->prepare("SELECT role_mapping_id FROM vsa_user_roles WHERE user_id = ? AND role = ? LIMIT 1");
    $insertRoleStmt = $pdo->prepare("INSERT INTO vsa_user_roles (user_id, role, entity_id, is_primary) VALUES (?, ?, ?, ?)");
    $updateRoleStmt = $pdo->prepare("UPDATE vsa_user_roles SET entity_id = ?, is_primary = ? WHERE role_mapping_id = ?");

    // Helper to get or create unified user
    $getOrCreateUser = function($email, $displayName, $googleId) use ($pdo, $getUserStmt, $insertUserStmt, $updateUserStmt) {
        $email = normalizeUserEmail($email);
        if (empty($email)) return null;

        $getUserStmt->execute([$email]);
        $existing = $getUserStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $userId = (int)$existing['user_id'];
            $newDisplayName = !empty($displayName) && empty($existing['display_name']) ? $displayName : null;
            $newGoogleId = !empty($googleId) && empty($existing['google_subject_id']) ? $googleId : null;
            if ($newDisplayName || $newGoogleId) {
                $updateUserStmt->execute([$newDisplayName, $newGoogleId, $userId]);
            }
            return $userId;
        }

        $insertUserStmt->execute([$email, $displayName ?: '', $googleId ?: null]);
        return (int)$pdo->lastInsertId();
    };

    // Helper to ensure role mapping
    $ensureRole = function($userId, $role, $entityId, $isPrimary) use ($getRoleStmt, $insertRoleStmt, $updateRoleStmt) {
        $getRoleStmt->execute([$userId, $role]);
        $existing = $getRoleStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $updateRoleStmt->execute([(int)$entityId, $isPrimary ? 1 : 0, (int)$existing['role_mapping_id']]);
        } else {
            $insertRoleStmt->execute([(int)$userId, $role, (int)$entityId, $isPrimary ? 1 : 0]);
        }
    };

    // A. Migrate Super Admins
    $admins = $pdo->query("SELECT admin_id, admin_name, admin_email FROM vsa_superadmin")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($admins as $a) {
        $email = normalizeUserEmail($a['admin_email']);
        if (empty($email)) continue;
        $name = !empty($a['admin_name']) ? $a['admin_name'] : 'Super Admin';
        $userId = $getOrCreateUser($email, $name, null);
        if ($userId) {
            $ensureRole($userId, 'admin', (int)$a['admin_id'], true);
        }
    }

    // B. Migrate Coaches
    $coaches = $pdo->query("SELECT coach_id, coach_name, coach_email, google_id FROM vsa_coaches")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($coaches as $c) {
        $email = normalizeUserEmail($c['coach_email']);
        if (empty($email)) continue;
        $name = !empty($c['coach_name']) ? $c['coach_name'] : 'Coach';
        $googleId = !empty($c['google_id']) ? $c['google_id'] : null;
        $userId = $getOrCreateUser($email, $name, $googleId);
        if ($userId) {
            // If user already has an admin role, admin remains primary, coach is secondary
            $hasAdmin = $pdo->query("SELECT COUNT(*) FROM vsa_user_roles WHERE user_id = {$userId} AND role = 'admin'")->fetchColumn();
            $ensureRole($userId, 'coach', (int)$c['coach_id'], $hasAdmin ? false : true);
        }
    }

    // C. Migrate Students
    $students = $pdo->query("SELECT student_id, student_name, student_email, google_id FROM vsa_students")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($students as $s) {
        $email = normalizeUserEmail($s['student_email']);
        if (empty($email)) continue;
        $name = !empty($s['student_name']) ? $s['student_name'] : 'Student';
        $googleId = !empty($s['google_id']) ? $s['google_id'] : null;
        $userId = $getOrCreateUser($email, $name, $googleId);
        if ($userId) {
            // If user already has an admin or coach role, that remains primary, student is secondary
            $hasHigher = $pdo->query("SELECT COUNT(*) FROM vsa_user_roles WHERE user_id = {$userId} AND role IN ('admin', 'coach')")->fetchColumn();
            $ensureRole($userId, 'student', (int)$s['student_id'], $hasHigher ? false : true);
        }
    }

    $pdo->commit();
    echo "Identity migration transaction committed successfully!\n\n";

} catch (Exception $e) {
    $pdo->rollBack();
    echo "ERROR during identity migration: " . $e->getMessage() . "\n";
    exit(1);
}

// 4. Verify record counts after migration
echo "=== POST-MIGRATION COUNTS & VERIFICATION ===\n";
$allCountsMatch = true;
foreach ($tablesToVerify as $t) {
    $countAfter = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
    $diff = $countAfter - $countsBefore[$t];
    $status = ($diff === 0) ? 'MATCH' : 'MISMATCH';
    if ($diff !== 0) $allCountsMatch = false;
    echo sprintf("Table %-28s: %d (diff: %+d) [%s]\n", $t, $countAfter, $diff, $status);
}

$userCount = (int)$pdo->query("SELECT COUNT(*) FROM vsa_users")->fetchColumn();
$roleCount = (int)$pdo->query("SELECT COUNT(*) FROM vsa_user_roles")->fetchColumn();
echo sprintf("\nUnified Users (vsa_users)      : %d\n", $userCount);
echo sprintf("Unified User Roles (vsa_user_roles): %d\n", $roleCount);

// 5. Display multi-role users in unified system
echo "\n=== MULTI-ROLE USERS IN UNIFIED ARCHITECTURE ===\n";
$multiRoles = $pdo->query("
    SELECT u.user_id, u.email, u.display_name, GROUP_CONCAT(CONCAT(r.role, ' (id:', r.entity_id, IF(r.is_primary, ', primary', ''), ')') ORDER BY r.role SEPARATOR ', ') as mapped_roles, COUNT(r.role) as total_roles
    FROM vsa_users u
    JOIN vsa_user_roles r ON u.user_id = r.user_id
    GROUP BY u.user_id
    HAVING total_roles > 1
")->fetchAll(PDO::FETCH_ASSOC);

foreach ($multiRoles as $m) {
    echo "User [{$m['user_id']}] {$m['email']} ({$m['display_name']}):\n  -> Roles: {$m['mapped_roles']}\n";
}

if ($allCountsMatch) {
    echo "\n>>> SUCCESS: All original entity tables preserved with zero record discrepancies.\n";
} else {
    echo "\n>>> WARNING: Discrepancy detected in table counts.\n";
}
