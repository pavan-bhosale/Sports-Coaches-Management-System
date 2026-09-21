<?php
/**
 * Automated Verification Script for VAVA Sports Academy Inventory Module
 */

require_once 'server/db_connect.php';

function runApi($method, $params = [], $headers = ['role' => 'admin']) {
    $url = 'http://localhost/VAVA_sports/server/inventory.php';

    $opts = [
        'http' => [
            'method' => $method,
            'ignore_errors' => true,
            'header' => [
                'Content-Type: application/json',
                'X-VAVA-Role: ' . ($headers['role'] ?? 'admin'),
                'X-VAVA-Email: ' . ($headers['email'] ?? 'admin@vavasports.com')
            ]
        ]
    ];

    if ($method === 'GET' && !empty($params)) {
        $url .= '?' . http_build_query($params);
    } elseif ($method !== 'GET') {
        $opts['http']['content'] = json_encode($params);
    }

    $context = stream_context_create($opts);
    $result = file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('{HTTP\/\S*\s(\d{3})}', $statusLine, $match);
    $statusCode = intval($match[1] ?? 0);

    return [
        'status' => $statusCode,
        'body'   => json_decode($result, true) ?: $result
    ];
}

$errors = [];
$passes = 0;

function assertTest($description, $condition, &$errors, &$passes) {
    if ($condition) {
        $passes++;
        echo "  [PASS] {$description}\n";
    } else {
        $errors[] = $description;
        echo "  [FAIL] {$description}\n";
    }
}

echo "======================================================\n";
echo "STARTING AUTOMATED INVENTORY & EQUIPMENT TESTS\n";
echo "======================================================\n\n";

// Cleanup test items if any exist from previous runs
$pdo->exec("DELETE FROM vsa_inventory WHERE item_name LIKE 'TEST_%'");

// 1. Role Authorization Tests
echo "--- 1. Testing Role Authorization ---\n";
$coachRes = runApi('GET', [], ['role' => 'coach']);
assertTest("Coach receives HTTP 403", $coachRes['status'] === 403, $errors, $passes);

$studentRes = runApi('GET', [], ['role' => 'student']);
assertTest("Student receives HTTP 403", $studentRes['status'] === 403, $errors, $passes);

$unknownRes = runApi('GET', [], ['role' => 'guest']);
assertTest("Unknown/guest role receives HTTP 403", $unknownRes['status'] === 403, $errors, $passes);

$adminRes = runApi('GET', [], ['role' => 'admin']);
assertTest("Super Admin receives HTTP 200", $adminRes['status'] === 200 && ($adminRes['body']['success'] ?? false) === true, $errors, $passes);

// 2. Create Inventory Item
echo "\n--- 2. Testing Item Creation & Uniqueness ---\n";
$createRes = runApi('POST', [
    'action' => 'create',
    'item_name' => 'TEST_Football_Size5',
    'description' => 'Match training balls for test',
    'initial_quantity' => 50
]);
assertTest("Create item returns HTTP 201", $createRes['status'] === 201, $errors, $passes);
$itemId = $createRes['body']['item']['inventory_id'] ?? 0;
assertTest("Created item has valid ID", $itemId > 0, $errors, $passes);
assertTest("Total quantity is 50", ($createRes['body']['item']['total_quantity'] ?? 0) === 50, $errors, $passes);
assertTest("Available quantity is 50", ($createRes['body']['item']['available_quantity'] ?? 0) === 50, $errors, $passes);
assertTest("Allocated quantity is 0", ($createRes['body']['item']['allocated_quantity'] ?? 0) === 0, $errors, $passes);
assertTest("Stock history has initial purchase entry", count($createRes['body']['item']['stock_history'] ?? []) === 1, $errors, $passes);

// Duplicate item creation test
$dupRes = runApi('POST', [
    'action' => 'create',
    'item_name' => 'TEST_Football_Size5',
    'description' => 'Duplicate attempt',
    'initial_quantity' => 10
]);
assertTest("Duplicate item creation is rejected with HTTP 400", $dupRes['status'] === 400, $errors, $passes);

// 3. Stock Operations (Add & Deduct)
echo "\n--- 3. Testing Stock Addition & Deduction ---\n";
$addRes = runApi('POST', [
    'action' => 'add_stock',
    'inventory_id' => $itemId,
    'quantity' => 20,
    'reason' => 'Mid-season restock'
]);
assertTest("Add stock returns HTTP 200", $addRes['status'] === 200, $errors, $passes);
assertTest("Total quantity updated to 70", ($addRes['body']['item']['total_quantity'] ?? 0) === 70, $errors, $passes);
assertTest("Available quantity updated to 70", ($addRes['body']['item']['available_quantity'] ?? 0) === 70, $errors, $passes);
assertTest("Stock history logged the addition", count($addRes['body']['item']['stock_history'] ?? []) === 2, $errors, $passes);

$deductRes = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $itemId,
    'quantity' => 10,
    'reason' => 'Damaged balls discarded'
]);
assertTest("Deduct stock returns HTTP 200", $deductRes['status'] === 200, $errors, $passes);
assertTest("Total quantity reduced to 60", ($deductRes['body']['item']['total_quantity'] ?? 0) === 60, $errors, $passes);
assertTest("Available quantity reduced to 60", ($deductRes['body']['item']['available_quantity'] ?? 0) === 60, $errors, $passes);
assertTest("Stock history logged the deduction", count($deductRes['body']['item']['stock_history'] ?? []) === 3, $errors, $passes);

// Deduct excessive stock test (> available)
$excessDeduct = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $itemId,
    'quantity' => 100,
    'reason' => 'Excessive deduction attempt'
]);
assertTest("Deducting more than available is rejected with HTTP 400", $excessDeduct['status'] === 400, $errors, $passes);

// 4. Batch Allocation
echo "\n--- 4. Testing Batch Allocation & Deallocation ---\n";
// Find existing batch IDs from vsa_batches
$batches = $pdo->query('SELECT batch_id, batch_name FROM vsa_batches ORDER BY batch_id ASC')->fetchAll();
$batch1Id = intval($batches[0]['batch_id']);
$batch2Id = intval($batches[1]['batch_id']);

// Allocate 15 to Batch 1
$alloc1 = runApi('POST', [
    'action' => 'allocate',
    'inventory_id' => $itemId,
    'batch_id' => $batch1Id,
    'quantity' => 15
]);
assertTest("Allocate 15 items returns HTTP 200", $alloc1['status'] === 200, $errors, $passes);
assertTest("Total quantity remains 60 (unchanged)", ($alloc1['body']['item']['total_quantity'] ?? 0) === 60, $errors, $passes);
assertTest("Allocated quantity is now 15", ($alloc1['body']['item']['allocated_quantity'] ?? 0) === 15, $errors, $passes);
assertTest("Available quantity is now 45", ($alloc1['body']['item']['available_quantity'] ?? 0) === 45, $errors, $passes);

// Allocate 10 to Batch 2
$alloc2 = runApi('POST', [
    'action' => 'allocate',
    'inventory_id' => $itemId,
    'batch_id' => $batch2Id,
    'quantity' => 10
]);
assertTest("Allocate 10 items to Batch 2 returns HTTP 200", $alloc2['status'] === 200, $errors, $passes);
assertTest("Allocated quantity is now 25", ($alloc2['body']['item']['allocated_quantity'] ?? 0) === 25, $errors, $passes);
assertTest("Available quantity is now 35", ($alloc2['body']['item']['available_quantity'] ?? 0) === 35, $errors, $passes);

// Allocate additional 5 to Batch 1 (merging into existing allocation)
$allocMerge = runApi('POST', [
    'action' => 'allocate',
    'inventory_id' => $itemId,
    'batch_id' => $batch1Id,
    'quantity' => 5
]);
assertTest("Additional allocation to Batch 1 returns HTTP 200", $allocMerge['status'] === 200, $errors, $passes);
$b1Alloc = null;
foreach ($allocMerge['body']['item']['allocations'] as $a) {
    if ($a['batch_id'] === $batch1Id) $b1Alloc = $a;
}
assertTest("Batch 1 allocation updated to 20 without duplicate entry", ($b1Alloc['quantity'] ?? 0) === 20, $errors, $passes);
assertTest("Total allocated is now 30", ($allocMerge['body']['item']['allocated_quantity'] ?? 0) === 30, $errors, $passes);
assertTest("Total available is now 30", ($allocMerge['body']['item']['available_quantity'] ?? 0) === 30, $errors, $passes);

// Attempt to allocate more than available (> 30)
$excessAlloc = runApi('POST', [
    'action' => 'allocate',
    'inventory_id' => $itemId,
    'batch_id' => $batch1Id,
    'quantity' => 50
]);
assertTest("Allocating more than available is rejected with HTTP 400", $excessAlloc['status'] === 400, $errors, $passes);

// Attempt to deduct more than available (available is 30, try to deduct 35)
$deductAllocated = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $itemId,
    'quantity' => 35,
    'reason' => 'Trying to deduct allocated gear'
]);
assertTest("Cannot deduct allocated gear (rejected with HTTP 400)", $deductAllocated['status'] === 400, $errors, $passes);

// Deallocate 5 from Batch 1
$dealloc1 = runApi('POST', [
    'action' => 'deallocate',
    'inventory_id' => $itemId,
    'batch_id' => $batch1Id,
    'quantity' => 5
]);
assertTest("Deallocate 5 from Batch 1 returns HTTP 200", $dealloc1['status'] === 200, $errors, $passes);
assertTest("Total allocated is now 25", ($dealloc1['body']['item']['allocated_quantity'] ?? 0) === 25, $errors, $passes);
assertTest("Total available is now 35", ($dealloc1['body']['item']['available_quantity'] ?? 0) === 35, $errors, $passes);

// Attempt to deallocate more than batch has
$excessDealloc = runApi('POST', [
    'action' => 'deallocate',
    'inventory_id' => $itemId,
    'batch_id' => $batch1Id,
    'quantity' => 999
]);
assertTest("Deallocating more than batch holds is rejected with HTTP 400", $excessDealloc['status'] === 400, $errors, $passes);

// 5. Deletion & Active Allocation Protection
echo "\n--- 5. Testing Deletion Restrictions ---\n";
$delBlocked = runApi('POST', [
    'action' => 'delete',
    'inventory_id' => $itemId
]);
assertTest("Deleting item with active allocations is blocked with HTTP 400", $delBlocked['status'] === 400, $errors, $passes);

// Deallocate all remaining: Batch 1 (15), Batch 2 (10)
runApi('POST', ['action' => 'deallocate', 'inventory_id' => $itemId, 'batch_id' => $batch1Id, 'quantity' => 15]);
$deallocAll = runApi('POST', ['action' => 'deallocate', 'inventory_id' => $itemId, 'batch_id' => $batch2Id, 'quantity' => 10]);
assertTest("After full deallocation, allocated is 0", ($deallocAll['body']['item']['allocated_quantity'] ?? 0) === 0, $errors, $passes);
assertTest("After full deallocation, available is 60", ($deallocAll['body']['item']['available_quantity'] ?? 0) === 60, $errors, $passes);
assertTest("Allocations list is empty", empty($deallocAll['body']['item']['allocations']), $errors, $passes);

// Now delete fully deallocated item
$delSuccess = runApi('POST', [
    'action' => 'delete',
    'inventory_id' => $itemId
]);
assertTest("Deleting fully deallocated item succeeds with HTTP 200", $delSuccess['status'] === 200, $errors, $passes);

// Verify item is gone
$verifyGone = runApi('GET', ['id' => $itemId]);
assertTest("Deleted item returns HTTP 404", $verifyGone['status'] === 404, $errors, $passes);

// 6. Verify Unrelated Tables Integrity
echo "\n--- 6. Checking Database Integrity ---\n";
$batchesCount = $pdo->query('SELECT COUNT(*) FROM vsa_batches')->fetchColumn();
assertTest("vsa_batches table intact (count: {$batchesCount})", $batchesCount > 0, $errors, $passes);
$studentsCount = $pdo->query('SELECT COUNT(*) FROM vsa_students')->fetchColumn();
assertTest("vsa_students table intact (count: {$studentsCount})", $studentsCount > 0, $errors, $passes);
$coachesCount = $pdo->query('SELECT COUNT(*) FROM vsa_coaches')->fetchColumn();
assertTest("vsa_coaches table intact (count: {$coachesCount})", $coachesCount > 0, $errors, $passes);
$adminCount = $pdo->query('SELECT COUNT(*) FROM vsa_superadmin')->fetchColumn();
assertTest("vsa_superadmin table intact (count: {$adminCount})", $adminCount > 0, $errors, $passes);

// 7. Comprehensive Available vs Allocated Stock Deduction Tests
echo "\n--- 7. Comprehensive Deduct Stock Tests (Available vs Allocated) ---\n";

// Setup Item for Test 1: Total = 21, Batch 1 = 9, Batch 2 = 9, Available = 3
$setup1 = runApi('POST', [
    'action' => 'create',
    'item_name' => 'TEST_Deduct_Item1',
    'initial_quantity' => 21
]);
$deductItemId1 = $setup1['body']['item']['inventory_id'];
runApi('POST', ['action' => 'allocate', 'inventory_id' => $deductItemId1, 'batch_id' => $batch1Id, 'quantity' => 9]);
$itemState1 = runApi('POST', ['action' => 'allocate', 'inventory_id' => $deductItemId1, 'batch_id' => $batch2Id, 'quantity' => 9]);

assertTest("[TEST 1 Init] Total is 21", ($itemState1['body']['item']['total_quantity'] ?? 0) === 21, $errors, $passes);
assertTest("[TEST 1 Init] Allocated is 18", ($itemState1['body']['item']['allocated_quantity'] ?? 0) === 18, $errors, $passes);
assertTest("[TEST 1 Init] Available is 3", ($itemState1['body']['item']['available_quantity'] ?? 0) === 3, $errors, $passes);

// TEST 1: Deduct 2 from Available Stock
$t1Res = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $deductItemId1,
    'deduct_source' => 'available',
    'quantity' => 2,
    'reason' => 'Lost equipment from storage'
]);
assertTest("TEST 1: Deduct 2 from Available returns HTTP 200", $t1Res['status'] === 200, $errors, $passes);
assertTest("TEST 1: Total decreases from 21 to 19", ($t1Res['body']['item']['total_quantity'] ?? 0) === 19, $errors, $passes);
assertTest("TEST 1: Available decreases from 3 to 1", ($t1Res['body']['item']['available_quantity'] ?? 0) === 1, $errors, $passes);
assertTest("TEST 1: Allocated remains 18", ($t1Res['body']['item']['allocated_quantity'] ?? 0) === 18, $errors, $passes);

// Setup Item for TEST 2: Total = 21, Batch 1 = 9, Batch 2 = 9, Available = 3
$setup2 = runApi('POST', [
    'action' => 'create',
    'item_name' => 'TEST_Deduct_Item2',
    'initial_quantity' => 21
]);
$deductItemId2 = $setup2['body']['item']['inventory_id'];
runApi('POST', ['action' => 'allocate', 'inventory_id' => $deductItemId2, 'batch_id' => $batch1Id, 'quantity' => 9]);
runApi('POST', ['action' => 'allocate', 'inventory_id' => $deductItemId2, 'batch_id' => $batch2Id, 'quantity' => 9]);

// TEST 2: Deduct 2 from Batch 1 Allocated Stock
$t2Res = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $deductItemId2,
    'deduct_source' => 'allocated',
    'batch_id' => $batch1Id,
    'quantity' => 2,
    'reason' => 'Damaged during practice'
]);
assertTest("TEST 2: Deduct 2 from Batch 1 returns HTTP 200", $t2Res['status'] === 200, $errors, $passes);
assertTest("TEST 2: Total decreases from 21 to 19", ($t2Res['body']['item']['total_quantity'] ?? 0) === 19, $errors, $passes);
assertTest("TEST 2: Available remains 3", ($t2Res['body']['item']['available_quantity'] ?? 0) === 3, $errors, $passes);
assertTest("TEST 2: Allocated decreases from 18 to 16", ($t2Res['body']['item']['allocated_quantity'] ?? 0) === 16, $errors, $passes);
$b1AllocQty = 0;
$b2AllocQty = 0;
foreach ($t2Res['body']['item']['allocations'] as $a) {
    if ($a['batch_id'] === $batch1Id) $b1AllocQty = $a['quantity'];
    if ($a['batch_id'] === $batch2Id) $b2AllocQty = $a['quantity'];
}
assertTest("TEST 2: Batch 1 allocation reduced from 9 to 7", $b1AllocQty === 7, $errors, $passes);
assertTest("TEST 2: Batch 2 allocation remains 9", $b2AllocQty === 9, $errors, $passes);

// Setup Item for TEST 3 & 4: Total = 20, Batch 1 = 5, Available = 15
$setup3 = runApi('POST', [
    'action' => 'create',
    'item_name' => 'TEST_Deduct_Item3',
    'initial_quantity' => 20
]);
$deductItemId3 = $setup3['body']['item']['inventory_id'];
runApi('POST', ['action' => 'allocate', 'inventory_id' => $deductItemId3, 'batch_id' => $batch1Id, 'quantity' => 5]);

// TEST 4: Invalid allocated deduction (attempt to deduct 6 when allocated is 5)
$t4Res = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $deductItemId3,
    'deduct_source' => 'allocated',
    'batch_id' => $batch1Id,
    'quantity' => 6,
    'reason' => 'Over-deduction attempt'
]);
assertTest("TEST 4: Deducting 6 from batch with 5 allocated is rejected with HTTP 400", $t4Res['status'] === 400, $errors, $passes);

// Verify item unchanged after rejected operation
$t4Verify = runApi('GET', ['id' => $deductItemId3]);
assertTest("TEST 4: Item total remains 20 after rejected deduction", ($t4Verify['body']['item']['total_quantity'] ?? 0) === 20, $errors, $passes);

// TEST 3: Full batch allocation deduction (deduct all 5 from Batch 1)
$t3Res = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $deductItemId3,
    'deduct_source' => 'allocated',
    'batch_id' => $batch1Id,
    'quantity' => 5,
    'reason' => 'Entire batch gear damaged in flood'
]);
assertTest("TEST 3: Full batch deduction returns HTTP 200", $t3Res['status'] === 200, $errors, $passes);
assertTest("TEST 3: Total decreases by 5 (20 -> 15)", ($t3Res['body']['item']['total_quantity'] ?? 0) === 15, $errors, $passes);
assertTest("TEST 3: Available remains unchanged (15)", ($t3Res['body']['item']['available_quantity'] ?? 0) === 15, $errors, $passes);
assertTest("TEST 3: Allocated is now 0", ($t3Res['body']['item']['allocated_quantity'] ?? 0) === 0, $errors, $passes);
assertTest("TEST 3: Batch 1 allocation entry completely removed from JSON", empty($t3Res['body']['item']['allocations']), $errors, $passes);

// TEST 5: Invalid available deduction (Available = 3, try to deduct 4)
// Use deductItemId1 which now has Available = 1
$t5Res = runApi('POST', [
    'action' => 'deduct_stock',
    'inventory_id' => $deductItemId1,
    'deduct_source' => 'available',
    'quantity' => 4,
    'reason' => 'Excessive available deduction'
]);
assertTest("TEST 5: Deducting 4 when available is 1 is rejected with HTTP 400", $t5Res['status'] === 400, $errors, $passes);

// TEST 6: Deallocation remains different (Total remains unchanged, Available increases)
// Setup Item: Total = 21, Batch 1 = 9, Available = 12
$setup6 = runApi('POST', [
    'action' => 'create',
    'item_name' => 'TEST_Deduct_Item6',
    'initial_quantity' => 21
]);
$deductItemId6 = $setup6['body']['item']['inventory_id'];
runApi('POST', ['action' => 'allocate', 'inventory_id' => $deductItemId6, 'batch_id' => $batch1Id, 'quantity' => 9]);

// Deallocate 2 from Batch 1
$t6Res = runApi('POST', [
    'action' => 'deallocate',
    'inventory_id' => $deductItemId6,
    'batch_id' => $batch1Id,
    'quantity' => 2
]);
assertTest("TEST 6: Deallocate returns HTTP 200", $t6Res['status'] === 200, $errors, $passes);
assertTest("TEST 6: Total remains 21 (gear not destroyed)", ($t6Res['body']['item']['total_quantity'] ?? 0) === 21, $errors, $passes);
assertTest("TEST 6: Batch 1 allocation decreased from 9 to 7", ($t6Res['body']['item']['allocations'][0]['quantity'] ?? 0) === 7, $errors, $passes);
assertTest("TEST 6: Available increased from 12 to 14", ($t6Res['body']['item']['available_quantity'] ?? 0) === 14, $errors, $passes);

// TEST 7: Stock history verification
$history1 = $t1Res['body']['item']['stock_history'];
$lastH1 = end($history1);
assertTest("TEST 7: Available deduction logged with source 'Available Stock'", ($lastH1['source'] ?? '') === 'Available Stock' && ($lastH1['type'] ?? '') === 'Deducted', $errors, $passes);

$history2 = $t2Res['body']['item']['stock_history'];
$lastH2 = end($history2);
assertTest("TEST 7: Allocated deduction logged with source 'Allocated Stock'", ($lastH2['source'] ?? '') === 'Allocated Stock' && ($lastH2['type'] ?? '') === 'Deducted', $errors, $passes);
assertTest("TEST 7: Allocated deduction logged with batch_id and batch_name", ($lastH2['batch_id'] ?? 0) === $batch1Id && !empty($lastH2['batch_name']), $errors, $passes);

// TEST 8: Data consistency invariant assertions
$itemsToAudit = [$t1Res['body']['item'], $t2Res['body']['item'], $t3Res['body']['item'], $t6Res['body']['item']];
$allConsistent = true;
foreach ($itemsToAudit as $it) {
    $tot = $it['total_quantity'];
    $alloc = $it['allocated_quantity'];
    $avail = $it['available_quantity'];
    if ($alloc > $tot || $avail < 0 || ($avail + $alloc) !== $tot) {
        $allConsistent = false;
    }
}
assertTest("TEST 8: Data consistency invariants hold (allocated <= total, avail >= 0, avail + alloc == total)", $allConsistent, $errors, $passes);

// Cleanup test items
$pdo->exec("DELETE FROM vsa_inventory WHERE item_name LIKE 'TEST_%'");

echo "\n======================================================\n";
echo "TEST RESULTS SUMMARY: {$passes} PASSED, " . count($errors) . " FAILED\n";
echo "======================================================\n";

if (!empty($errors)) {
    echo "Failures:\n";
    foreach ($errors as $e) {
        echo " - " . $e . "\n";
    }
}
