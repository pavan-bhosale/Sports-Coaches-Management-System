<?php
/**
 * Test Backend APIs for Batch <-> Coach Assignment, Dynamic Student Count, and Attendance
 */
require_once __DIR__ . '/../server/db_connect.php';

function runApi($url, $method = 'GET', $data = null) {
    $ch = curl_init('http://localhost/VAVA_sports/server/' . $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($data !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }
    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $httpCode, 'data' => json_decode($res, true), 'raw' => $res];
}

echo "=== STARTING BACKEND INTEGRATION TESTS ===\n\n";

// Idempotent pre-cleanup
$pdo->exec("DELETE FROM vsa_batches WHERE batch_name LIKE 'Auto Test%'");
$pdo->exec("DELETE FROM vsa_coaches WHERE coach_name LIKE 'Automated Test%'");
$pdo->exec("DELETE FROM vsa_students WHERE student_name LIKE 'Batch Count%'");

// 1. Test Coach Creation without Batch
echo "1. Testing Add Coach without batch...\n";
$coachData = [
    'coach_name' => 'Automated Test Coach',
    'coach_email' => 'autocoach_' . time() . '@test.com',
    'coach_phone' => '9876543210',
    'coach_dob' => '1990-05-15',
    'coach_joined_date' => '2026-01-10',
    'coach_license' => 'AIFF B License',
    'coach_address' => '123 Stadium Road',
    'coach_city' => 'Vasai',
    'coach_postal_code' => '401201',
    'emergency_contact_name' => 'Emergency Person',
    'emergency_contact_number' => '9876543211'
];
$res = runApi('coaches.php', 'POST', $coachData);
assert($res['code'] === 200, "Coach creation failed: " . $res['raw']);
$createdCoachId = $res['data']['coach_id'];
echo "✓ Coach created successfully with ID: $createdCoachId (no batch assigned)\n\n";

// 2. Test Fetching Batches with Dynamic Student Count
echo "2. Testing Batches GET dynamic student count...\n";
$res = runApi('batches.php', 'GET');
assert($res['code'] === 200, "Batches GET failed");
$batches = $res['data']['batches'];
assert(count($batches) > 0, "No batches found");
$sampleBatch = $batches[0];
assert(isset($sampleBatch['student_count']), "student_count missing from batch");
assert(!isset($sampleBatch['error']), "Error returned in batch");
echo "✓ Batches returned with dynamic student_count (Sample: '{$sampleBatch['batch_name']}' has {$sampleBatch['student_count']} students)\n\n";

// 3. Test Add Batch without Coach
echo "3. Testing Add Batch without Coach...\n";
$batchNoCoach = [
    'batch_name' => 'Auto Test Batch NoCoach',
    'batch_location' => 'Vasai Ground A',
    'batch_time' => '07:30'
];
$res = runApi('batches.php', 'POST', $batchNoCoach);
assert($res['code'] === 200, "Add batch without coach failed: " . $res['raw']);
$batchNoCoachId = $res['data']['batch']['batch_id'];
echo "✓ Batch created with ID: $batchNoCoachId (coach_id is null)\n\n";

// 4. Test Add Batch WITH Coach
echo "4. Testing Add Batch WITH Coach (Assign to $createdCoachId)...\n";
$batchWithCoach1 = [
    'batch_name' => 'Auto Test Batch Coach A',
    'batch_location' => 'Vasai Ground B',
    'batch_time' => '09:00',
    'coach_id' => $createdCoachId
];
$res = runApi('batches.php', 'POST', $batchWithCoach1);
assert($res['code'] === 200, "Add batch with coach failed: " . $res['raw']);
$batchWithCoach1Id = $res['data']['batch']['batch_id'];
echo "✓ Batch 1 assigned to Coach $createdCoachId created with ID: $batchWithCoach1Id\n\n";

// 5. Test Assigning SAME Coach to a SECOND Batch (Multiple Batches for One Coach)
echo "5. Testing Multiple Batches for One Coach (Assigning Batch 2 to Coach $createdCoachId)...\n";
$batchWithCoach2 = [
    'batch_name' => 'Auto Test Batch Coach B',
    'batch_location' => 'Vasai Ground C',
    'batch_time' => '17:00',
    'coach_id' => $createdCoachId
];
$res = runApi('batches.php', 'POST', $batchWithCoach2);
assert($res['code'] === 200, "Add second batch with same coach failed: " . $res['raw']);
$batchWithCoach2Id = $res['data']['batch']['batch_id'];
echo "✓ Batch 2 assigned to Coach $createdCoachId created with ID: $batchWithCoach2Id\n\n";

// Verify Coach now has both batches
$res = runApi("coaches.php?id=$createdCoachId", 'GET');
$coachInfo = $res['data']['coach'];
echo "Coach {$coachInfo['coach_name']} assigned batches: '{$coachInfo['batch_name']}'\n";
assert(strpos($coachInfo['batch_name'], 'Auto Test Batch Coach A') !== false, "Batch A not in coach batch list");
assert(strpos($coachInfo['batch_name'], 'Auto Test Batch Coach B') !== false, "Batch B not in coach batch list");
echo "✓ Multiple batches verified for single coach!\n\n";

// 6. Test Edit Batch: Change Coach and Remove Coach
echo "6. Testing Edit Batch (Remove Coach from Batch 1)...\n";
$updateData = [
    'batch_id' => $batchWithCoach1Id,
    'batch_name' => 'Auto Test Batch Coach A (Updated)',
    'batch_location' => 'Vasai Ground B',
    'batch_time' => '09:30',
    'coach_id' => 0 // Remove coach
];
$res = runApi('batches.php', 'PUT', $updateData);
assert($res['code'] === 200, "Update batch failed: " . $res['raw']);

// Verify in DB that batch 1 has coach_id null
$stmt = $pdo->prepare("SELECT coach_id FROM vsa_batches WHERE batch_id = ?");
$stmt->execute([$batchWithCoach1Id]);
$cId = $stmt->fetchColumn();
assert($cId === null, "coach_id was not cleared to null");
echo "✓ Coach successfully removed from Batch 1 (coach_id is null)\n\n";

// 7. Test Dynamic Student Count changes
echo "7. Testing Dynamic Student Count calculation with new student...\n";
$stmtCountBefore = $pdo->prepare("SELECT COUNT(*) FROM vsa_students WHERE batch_id = ?");
$stmtCountBefore->execute([$batchWithCoach2Id]);
$countBefore = intval($stmtCountBefore->fetchColumn());

// Insert a student into batch 2
$stmtStud = $pdo->prepare("
    INSERT INTO vsa_students (student_name, student_email, parent_name, branch_name, city, father_contact_number, school_name, batch_id, batch_name, coach_name, gender, blood_group, postal_code, whatsapp_number, emergency_contact_number)
    VALUES (?, ?, 'Parent', 'Vasai', 'Vasai', '9998887770', 'School', ?, 'Auto Test Batch Coach B', 'Automated Test Coach', 'Male', 'O+', '401201', '9998887770', '9998887770')
");
$testStudEmail = 'batchtest_' . time() . '@test.com';
$stmtStud->execute(['Batch Count Test Student', $testStudEmail, $batchWithCoach2Id]);
$testStudentId = $pdo->lastInsertId();

// Fetch batch list and verify student_count became 1
$res = runApi('batches.php', 'GET');
$batches = $res['data']['batches'];
$foundBatch = null;
foreach ($batches as $b) {
    if (intval($b['batch_id']) === intval($batchWithCoach2Id)) {
        $foundBatch = $b;
        break;
    }
}
assert($foundBatch !== null, "Batch 2 not found");
echo "Batch 2 dynamic student count after adding student: {$foundBatch['student_count']}\n";
assert(intval($foundBatch['student_count']) === $countBefore + 1, "Dynamic count did not increment");

// Delete student and verify count decrements
$stmtDelStud = $pdo->prepare("DELETE FROM vsa_students WHERE student_id = ?");
$stmtDelStud->execute([$testStudentId]);

$res = runApi('batches.php', 'GET');
$batches = $res['data']['batches'];
foreach ($batches as $b) {
    if (intval($b['batch_id']) === intval($batchWithCoach2Id)) {
        $foundBatch = $b;
        break;
    }
}
echo "Batch 2 dynamic student count after removing student: {$foundBatch['student_count']}\n";
assert(intval($foundBatch['student_count']) === $countBefore, "Dynamic count did not decrement");
echo "✓ Dynamic student count accurately tracks database student records!\n\n";

// 8. Cleanup test data
echo "8. Cleaning up test records...\n";
$pdo->prepare("DELETE FROM vsa_batches WHERE batch_id IN (?, ?, ?)")->execute([$batchNoCoachId, $batchWithCoach1Id, $batchWithCoach2Id]);
$pdo->prepare("DELETE FROM vsa_coaches WHERE coach_id = ?")->execute([$createdCoachId]);
echo "✓ Cleaned up all test batches and coach.\n\n";

echo "=== ALL BACKEND INTEGRATION TESTS PASSED! ===\n";
