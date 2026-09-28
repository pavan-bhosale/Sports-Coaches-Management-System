<?php
require_once __DIR__ . '/../server/db_connect.php';

echo "=== TEST: STUDENT PHOTO UPLOAD, OPTIMIZATION & PERSISTENCE ===\n\n";

// 1. Verify existing student 4 photo
$stmt = $pdo->prepare("SELECT student_id, student_name, student_photo FROM vsa_students WHERE student_id = 4");
$stmt->execute();
$existingStudent4 = $stmt->fetch(PDO::FETCH_ASSOC);
echo "1. Existing Student 4: " . ($existingStudent4['student_photo'] ?? 'None') . "\n";
assert(!empty($existingStudent4['student_photo']), "Student 4 should have existing photo");
assert(file_exists(__DIR__ . '/../' . $existingStudent4['student_photo']), "Student 4 photo file should exist on disk");

$base64Photo = 'data:image/jpeg;base64,' . base64_encode(file_get_contents(__DIR__ . '/../' . $existingStudent4['student_photo']));

$postData = [
    'student_name' => 'Automated Test Player ' . time(),
    'parent_name' => 'Parent Test',
    'date_of_birth' => '2010-05-15',
    'gender' => 'male',
    'blood_group' => 'O+',
    'branch_name' => 'virar',
    'batch_name' => 'No Batch',
    'coach_name' => 'Unassigned',
    'address' => '123 Sports Road',
    'city' => 'Virar',
    'postal_code' => '401303',
    'father_contact_number' => '9876543210',
    'student_email' => 'testplayer_' . time() . '@example.com',
    'school_name' => 'Test Academy School',
    'image_data' => $base64Photo
];

$ch = curl_init('http://127.0.0.1/VAVA_sports/server/students.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-VAVA-Role: admin'
]);
$res = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "2. Register Student with Photo HTTP: $httpCode\n";
$created = json_decode($res, true);
echo "Response: " . json_encode($created) . "\n";
assert($httpCode === 200, "Registration HTTP should be 200");
assert($created['success'] === true, "Registration should succeed");
$newStudentId = $created['student_id'];
$newPhotoPath = $created['student_photo'];
assert(!empty($newPhotoPath), "Photo should be saved and returned");
assert(file_exists(__DIR__ . '/../' . $newPhotoPath), "New photo file must exist on disk");
$newPhotoSize = filesize(__DIR__ . '/../' . $newPhotoPath);
echo "New Photo File: $newPhotoPath (Size: $newPhotoSize bytes)\n";

// 3. Verify in database
$stmt = $pdo->prepare("SELECT student_id, student_name, student_photo FROM vsa_students WHERE student_id = ?");
$stmt->execute([$newStudentId]);
$dbRecord = $stmt->fetch(PDO::FETCH_ASSOC);
echo "3. DB verification for ID $newStudentId: " . $dbRecord['student_photo'] . "\n";
assert($dbRecord['student_photo'] === $newPhotoPath, "DB record must match saved photo path");

// 4. Update photo via action: 'upload_photo'
$ch = curl_init('http://127.0.0.1/VAVA_sports/server/students.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'action' => 'upload_photo',
    'student_id' => $newStudentId,
    'image_data' => $base64Photo
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-VAVA-Role: admin'
]);
$res2 = curl_exec($ch);
curl_close($ch);
$updated = json_decode($res2, true);
echo "4. Replace Photo Response: " . json_encode($updated) . "\n";
assert($updated['success'] === true, "Upload photo should succeed");
$updatedPhotoPath = $updated['student_photo'];
assert(!empty($updatedPhotoPath), "Updated photo path should exist");
assert(file_exists(__DIR__ . '/../' . $updatedPhotoPath), "Updated photo file must exist on disk");
assert(!file_exists(__DIR__ . '/../' . $newPhotoPath), "Old photo file should be cleanly unlinked");

// 5. Verify existing student 4 photo is still intact
assert(file_exists(__DIR__ . '/../' . $existingStudent4['student_photo']), "Student 4 photo file MUST remain intact");
echo "5. Verified Student 4 photo remains 100% intact!\n";

// 6. Delete student photo via action: 'delete_photo'
$ch = curl_init('http://127.0.0.1/VAVA_sports/server/students.php');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'action' => 'delete_photo',
    'student_id' => $newStudentId
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-VAVA-Role: admin'
]);
$res3 = curl_exec($ch);
curl_close($ch);
$deleted = json_decode($res3, true);
echo "6. Delete Photo Response: " . json_encode($deleted) . "\n";
assert($deleted['success'] === true, "Delete photo should succeed");

$stmt = $pdo->prepare("SELECT student_photo FROM vsa_students WHERE student_id = ?");
$stmt->execute([$newStudentId]);
$cleared = $stmt->fetch(PDO::FETCH_ASSOC);
assert(is_null($cleared['student_photo']), "Student photo in DB should be NULL after delete");

// Clean up test student
$pdo->prepare("DELETE FROM vsa_students WHERE student_id = ?")->execute([$newStudentId]);
echo "7. Cleaned up test student record $newStudentId.\n";

echo "\nALL API TESTS PASSED SUCCESSFULLY!\n";
