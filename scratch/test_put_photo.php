<?php
require_once __DIR__ . '/../server/db_connect.php';

// 1. Create a student with old photo
$stmt = $pdo->prepare('INSERT INTO vsa_students (student_name, parent_name, branch_name, city, father_contact_number, school_name, status, student_photo) VALUES (?,?,?,?,?,?,?,?)');
$oldPhotoRel = 'uploads/students/test_old_' . time() . '.webp';
file_put_contents(__DIR__ . '/../' . $oldPhotoRel, 'old_photo_bytes');
$stmt->execute(['PUT Test', 'Parent', 'virar', 'Virar', '9876543210', 'School', 'Active', $oldPhotoRel]);
$id = $pdo->lastInsertId();

echo "Created test student $id with photo $oldPhotoRel\n";

$ch = curl_init('http://127.0.0.1/VAVA_sports/server/students.php');
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'student_id' => $id,
    'student_name' => 'PUT Test Updated',
    'parent_name' => 'Parent',
    'branch_name' => 'virar',
    'city' => 'Virar',
    'father_contact_number' => '9876543210',
    'school_name' => 'School',
    'image_data' => 'data:image/webp;base64,UklGRrQEAABXRUJQVlA4WAoAAAAgAAAAVwIAVwIASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggxgIAAPBQAJ0BKlgCWAI+USiSRyOioaEgCABwCglpbuF3YRtACewD32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2ThQAAP7/4sF/+dq2Ps+/oaNPMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-VAVA-Role: admin'
]);
$resp = curl_exec($ch);
echo "PUT Response: $resp\n";

$check = $pdo->query("SELECT student_photo FROM vsa_students WHERE student_id = $id")->fetch(PDO::FETCH_ASSOC);
echo "DB photo after PUT: " . $check['student_photo'] . "\n";
echo "Old file exists: " . (file_exists(__DIR__ . '/../' . $oldPhotoRel) ? "YES (NOT unlinked)" : "NO (Cleanly unlinked)") . "\n";
echo "New file exists: " . (file_exists(__DIR__ . '/../' . $check['student_photo']) ? "YES" : "NO") . "\n";

// Cleanup
if ($check['student_photo'] && file_exists(__DIR__ . '/../' . $check['student_photo'])) {
    @unlink(__DIR__ . '/../' . $check['student_photo']);
}
if (file_exists(__DIR__ . '/../' . $oldPhotoRel)) {
    @unlink(__DIR__ . '/../' . $oldPhotoRel);
}
$pdo->query("DELETE FROM vsa_students WHERE student_id = $id");
echo "Cleaned up test student.\n";
