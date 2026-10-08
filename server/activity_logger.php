<?php
/**
 * VAVA Sports Academy - Central Activity & Audit Logger
 * 
 * Provides centralized server-side logging of all meaningful business actions
 * across Students, Coaches, Batches, Attendance, Inventory, Fees, and Authentication.
 * 
 * Guarantees:
 * - Standalone logging into vsa_activity_log
 * - Executed strictly AFTER successful database operations
 * - Captures authenticated actor role, name, email, and ID
 * - Structured taxonomy for module, action_type, target_type, target_id, target_name
 * - Non-throwing safety (logs never crash the primary business operation)
 */

if (!function_exists('resolveCurrentActor')) {
    function resolveCurrentActor($pdo, $input = []) {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }

        $sessionRole  = !empty($_SESSION['user_role']) ? strtolower(trim($_SESSION['user_role'])) : '';
        $sessionEmail = !empty($_SESSION['user_email']) ? strtolower(trim($_SESSION['user_email'])) : '';
        $hasSession   = !empty($sessionRole) && !empty($sessionEmail);

        // When a valid PHP session exists, SESSION IS AUTHORITATIVE.
        // Headers CANNOT override or downgrade a session actor.
        if ($hasSession) {
            $roleClean        = $sessionRole;
            $effectiveEmail   = $sessionEmail;
            $coachIdSession   = intval($_SESSION['coach_id'] ?? 0);
            $studentIdSession = intval($_SESSION['student_id'] ?? 0);
            $adminIdSession   = intval($_SESSION['admin_id'] ?? 0);
            $actorNameInput   = $_SESSION['user_name'] ?? '';
        } else {
            // Unauthenticated fallback: strictly for logging system / webhook events
            $roleClean        = strtolower(trim($_SERVER['HTTP_X_VAVA_ROLE'] ?? $input['role'] ?? 'system'));
            $effectiveEmail   = $_SERVER['HTTP_X_VAVA_EMAIL'] ?? $input['email'] ?? '';
            $coachIdSession   = intval($_SERVER['HTTP_X_VAVA_COACH_ID'] ?? $input['coach_id'] ?? 0);
            $studentIdSession = intval($_SERVER['HTTP_X_VAVA_STUDENT_ID'] ?? $input['student_id'] ?? 0);
            $adminIdSession   = 0;
            $actorNameInput   = $_SERVER['HTTP_X_VAVA_ACTOR_NAME'] ?? $input['actor_name'] ?? $input['name'] ?? '';
        }

        // 1. SUPERADMIN / ADMIN ACTOR
        if ($roleClean === 'admin' || $roleClean === 'superadmin' || $roleClean === 'super admin') {
            $admin = null;
            if ($adminIdSession > 0) {
                $stmt = $pdo->prepare('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE admin_id = ?');
                $stmt->execute([$adminIdSession]);
                $admin = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$admin && !empty($effectiveEmail)) {
                $stmt = $pdo->prepare('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE LOWER(TRIM(admin_email)) = LOWER(TRIM(?))');
                $stmt->execute([$effectiveEmail]);
                $admin = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($admin) {
                return [
                    'actor_role'  => 'superadmin',
                    'actor_id'    => intval($admin['admin_id']),
                    'name'        => $admin['admin_name'] ?: ($actorNameInput ?: 'Super Admin'),
                    'actor_name'  => $admin['admin_name'] ?: ($actorNameInput ?: 'Super Admin'),
                    'actor_email' => $admin['admin_email'] ?: ($effectiveEmail ?: null)
                ];
            }

            return [
                'actor_role'  => 'superadmin',
                'actor_id'    => $adminIdSession > 0 ? $adminIdSession : null,
                'name'        => $actorNameInput ?: 'Super Admin',
                'actor_name'  => $actorNameInput ?: 'Super Admin',
                'actor_email' => $effectiveEmail ?: null
            ];
        }

        // 2. COACH ACTOR
        if ($roleClean === 'coach') {
            $coach = null;
            if ($coachIdSession > 0) {
                $stmt = $pdo->prepare('SELECT coach_id, coach_name, coach_email FROM vsa_coaches WHERE coach_id = ?');
                $stmt->execute([$coachIdSession]);
                $coach = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$coach && !empty($effectiveEmail)) {
                $stmt = $pdo->prepare('SELECT coach_id, coach_name, coach_email FROM vsa_coaches WHERE LOWER(TRIM(coach_email)) = LOWER(TRIM(?))');
                $stmt->execute([$effectiveEmail]);
                $coach = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($coach) {
                return [
                    'actor_role'  => 'coach',
                    'actor_id'    => intval($coach['coach_id']),
                    'actor_name'  => $coach['coach_name'] ?: ($actorNameInput ?: 'Coach'),
                    'actor_email' => $coach['coach_email'] ?: $effectiveEmail
                ];
            }

            return [
                'actor_role'  => 'coach',
                'actor_id'    => $coachIdSession > 0 ? $coachIdSession : null,
                'actor_name'  => $actorNameInput ?: 'Coach',
                'actor_email' => $effectiveEmail ?: null
            ];
        }

        // 3. STUDENT ACTOR
        if ($roleClean === 'student') {
            $student = null;
            if ($studentIdSession > 0) {
                $stmt = $pdo->prepare('SELECT student_id, student_name, student_email FROM vsa_students WHERE student_id = ?');
                $stmt->execute([$studentIdSession]);
                $student = $stmt->fetch(PDO::FETCH_ASSOC);
            } elseif (!empty($effectiveEmail)) {
                $stmt = $pdo->prepare('SELECT student_id, student_name, student_email FROM vsa_students WHERE LOWER(TRIM(student_email)) = LOWER(TRIM(?))');
                $stmt->execute([$effectiveEmail]);
                $student = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($student) {
                return [
                    'actor_role'  => 'student',
                    'actor_id'    => intval($student['student_id']),
                    'actor_name'  => $student['student_name'] ?: ($actorNameInput ?: 'Student'),
                    'actor_email' => $student['student_email'] ?: $effectiveEmail
                ];
            }

            return [
                'actor_role'  => 'student',
                'actor_id'    => $studentIdSession > 0 ? $studentIdSession : null,
                'actor_name'  => $actorNameInput ?: 'Student',
                'actor_email' => $effectiveEmail ?: null
            ];
        }

        // 4. SYSTEM / OTHER ACTOR
        return [
            'actor_role'  => 'system',
            'actor_id'    => null,
            'actor_name'  => $actorNameInput ?: 'System',
            'actor_email' => $effectiveEmail ?: null
        ];
    }
}

if (!function_exists('logActivity')) {
    function logActivity($pdo, array $params): ?int {
        try {
            $actorRole  = $params['actor_role']  ?? 'superadmin';
            $actorName  = $params['actor_name']  ?? 'Superadmin';
            $actorEmail = $params['actor_email'] ?? null;
            $actorId    = !empty($params['actor_id']) ? intval($params['actor_id']) : null;

            $module     = strtoupper(trim($params['module'] ?? 'SYSTEM'));
            $actionType = trim($params['action_type'] ?? 'Action');
            $targetType = !empty($params['target_type']) ? trim($params['target_type']) : null;
            $targetId   = !empty($params['target_id']) ? intval($params['target_id']) : null;
            $targetName = !empty($params['target_name']) ? trim($params['target_name']) : null;
            $description= trim($params['description'] ?? '');

            if (empty($description)) {
                $description = "{$actionType} {$module}" . ($targetName ? " — {$targetName}" : '');
            }

            $detailsJson = null;
            if (!empty($params['details'])) {
                if (is_string($params['details'])) {
                    $detailsJson = $params['details'];
                } else {
                    $detailsJson = json_encode($params['details'], JSON_UNESCAPED_UNICODE);
                }
            }

            $sql = '
                INSERT INTO vsa_activity_log 
                    (actor_id, actor_name, actor_email, actor_role, module, action_type, target_type, target_id, target_name, description, details, created_at)
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ';

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $actorId,
                $actorName,
                $actorEmail,
                $actorRole,
                $module,
                $actionType,
                $targetType,
                $targetId,
                $targetName,
                $description,
                $detailsJson
            ]);

            return intval($pdo->lastInsertId());
        } catch (Exception $e) {
            error_log('Failed to log activity: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('recordActivity')) {
    /**
     * Convenient wrapper that resolves actor automatically and logs activity.
     */
    function recordActivity($pdo, $module, $actionType, $targetType, $targetId, $targetName, $description, $details = null, $input = []) {
        $actor = resolveCurrentActor($pdo, $input);
        return logActivity($pdo, array_merge($actor, [
            'module'      => $module,
            'action_type' => $actionType,
            'target_type' => $targetType,
            'target_id'   => $targetId,
            'target_name' => $targetName,
            'description' => $description,
            'details'     => $details
        ]));
    }
}
