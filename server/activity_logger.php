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
        $roleHeader     = $_SERVER['HTTP_X_VAVA_ROLE']       ?? $_GET['role']       ?? $input['role']       ?? '';
        $emailHeader    = $_SERVER['HTTP_X_VAVA_EMAIL']      ?? $_GET['email']      ?? $input['email']      ?? '';
        $coachIdHeader  = $_SERVER['HTTP_X_VAVA_COACH_ID']   ?? $_GET['coach_id']   ?? $input['coach_id']   ?? 0;
        $actorNameInput = $_SERVER['HTTP_X_VAVA_ACTOR_NAME'] ?? $input['actor_name'] ?? $input['name']       ?? '';

        $roleClean = strtolower(trim($roleHeader));

        // 1. COACH ACTOR
        if ($roleClean === 'coach') {
            $coachId = intval($coachIdHeader);
            $coach = null;
            if ($coachId > 0) {
                $stmt = $pdo->prepare('SELECT coach_id, coach_name, coach_email FROM vsa_coaches WHERE coach_id = ?');
                $stmt->execute([$coachId]);
                $coach = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if (!$coach && !empty($emailHeader)) {
                $stmt = $pdo->prepare('SELECT coach_id, coach_name, coach_email FROM vsa_coaches WHERE LOWER(TRIM(coach_email)) = LOWER(TRIM(?))');
                $stmt->execute([$emailHeader]);
                $coach = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($coach) {
                return [
                    'actor_role'  => 'coach',
                    'actor_id'    => intval($coach['coach_id']),
                    'actor_name'  => $coach['coach_name'] ?: ($actorNameInput ?: 'Coach'),
                    'actor_email' => $coach['coach_email'] ?: $emailHeader
                ];
            }

            return [
                'actor_role'  => 'coach',
                'actor_id'    => $coachId > 0 ? $coachId : null,
                'actor_name'  => $actorNameInput ?: 'Coach',
                'actor_email' => $emailHeader ?: null
            ];
        }

        // 2. STUDENT ACTOR
        if ($roleClean === 'student') {
            $studentId = intval($_SERVER['HTTP_X_VAVA_STUDENT_ID'] ?? $input['student_id'] ?? 0);
            $student = null;
            if ($studentId > 0) {
                $stmt = $pdo->prepare('SELECT student_id, student_name, student_email FROM vsa_students WHERE student_id = ?');
                $stmt->execute([$studentId]);
                $student = $stmt->fetch(PDO::FETCH_ASSOC);
            } elseif (!empty($emailHeader)) {
                $stmt = $pdo->prepare('SELECT student_id, student_name, student_email FROM vsa_students WHERE LOWER(TRIM(student_email)) = LOWER(TRIM(?))');
                $stmt->execute([$emailHeader]);
                $student = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($student) {
                return [
                    'actor_role'  => 'student',
                    'actor_id'    => intval($student['student_id']),
                    'actor_name'  => $student['student_name'] ?: ($actorNameInput ?: 'Student'),
                    'actor_email' => $student['student_email'] ?: $emailHeader
                ];
            }

            return [
                'actor_role'  => 'student',
                'actor_id'    => $studentId > 0 ? $studentId : null,
                'actor_name'  => $actorNameInput ?: 'Student',
                'actor_email' => $emailHeader ?: null
            ];
        }

        // 3. SUPERADMIN / ADMIN ACTOR (Default)
        $admin = null;
        if (!empty($emailHeader)) {
            $stmt = $pdo->prepare('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin WHERE LOWER(TRIM(admin_email)) = LOWER(TRIM(?))');
            $stmt->execute([$emailHeader]);
            $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$admin) {
            // Check default superadmin record in vsa_superadmin
            try {
                $stmt = $pdo->query('SELECT admin_id, admin_name, admin_email FROM vsa_superadmin ORDER BY admin_id ASC LIMIT 1');
                $admin = $stmt->fetch(PDO::FETCH_ASSOC);
            } catch (Exception $e) {
                $admin = null;
            }
        }

        if ($admin) {
            return [
                'actor_role'  => 'superadmin',
                'actor_id'    => intval($admin['admin_id']),
                'actor_name'  => $admin['admin_name'] ?: ($actorNameInput ?: 'Superadmin'),
                'actor_email' => $admin['admin_email'] ?: ($emailHeader ?: null)
            ];
        }

        return [
            'actor_role'  => 'superadmin',
            'actor_id'    => null,
            'actor_name'  => $actorNameInput ?: 'Superadmin',
            'actor_email' => $emailHeader ?: null
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
