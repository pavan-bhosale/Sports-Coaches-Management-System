<?php
/**
 * VAVA Sports Academy - Inventory & Equipment Management API
 * 
 * Academy-Wide Inventory Management (Super Admin Only).
 * Single database table: vsa_inventory
 * Columns: inventory_id, item_name, total_quantity, allocations, stock_history, created_at, updated_at
 * Handles:
 *  - GET: list inventory items (computed available & allocated, resolved batch names)
 *  - POST (action: create): add new equipment item (item_name, initial_quantity)
 *  - POST (action: add_stock): increase total stock and log history
 *  - POST (action: deduct_stock): decrease total stock within available bounds and log history
 *  - POST (action: allocate): allocate available stock to an existing batch
 *  - POST (action: deallocate): return equipment from batch to available stock
 *  - DELETE / POST (action: delete): remove item if zero active allocations
 */

date_default_timezone_set('Asia/Kolkata');

// Always output JSON
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-VAVA-Role, X-VAVA-Email');

// Helper to respond with JSON errors consistently
function respondError($message, $code = 400) {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'message' => $message,
        'error'   => $message
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Helper to respond with JSON success consistently
function respondSuccess($data = [], $code = 200) {
    http_response_code($code);
    echo json_encode(array_merge(['success' => true], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_connect.php';

$method = $_SERVER['REQUEST_METHOD'];

// ── Super Admin Authorization Enforcement ────────────────────────────────────
$roleHeader = $_SERVER['HTTP_X_VAVA_ROLE'] ?? $_GET['role'] ?? '';
$emailHeader = $_SERVER['HTTP_X_VAVA_EMAIL'] ?? $_GET['email'] ?? '';

// If body is JSON, also check role in input if header was not set
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?: [];

if (empty($roleHeader) && !empty($input['role'])) {
    $roleHeader = $input['role'];
}
if (empty($emailHeader) && !empty($input['email'])) {
    $emailHeader = $input['email'];
}

$roleLower = strtolower(trim($roleHeader));

// Coaches and Students are strictly forbidden (HTTP 403)
if ($roleLower === 'coach' || $roleLower === 'student' || ($roleLower !== 'admin' && $roleLower !== 'superadmin')) {
    respondError('Access denied. The Inventory & Equipment module is accessible to Super Admin only.', 403);
}

// ── Helper: Safe JSON decode ────────────────────────────────────────────────
function safeDecodeJson($raw, $default = []) {
    if (empty($raw)) return $default;
    if (is_array($raw)) return $raw;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $default;
}

// ── Helper: Calculate allocated quantity ─────────────────────────────────────
function calculateAllocatedQuantity(array $allocations) {
    $total = 0;
    foreach ($allocations as $alloc) {
        $qty = intval($alloc['quantity'] ?? 0);
        if ($qty > 0) {
            $total += $qty;
        }
    }
    return $total;
}

// ── Helper: Fetch and index all batches from vsa_batches ────────────────────
function getBatchesMap($pdo) {
    $stmt = $pdo->query('
        SELECT b.batch_id, b.batch_name, b.batch_location, b.sport, b.status,
               COUNT(DISTINCT s.student_id) AS student_count
        FROM vsa_batches b
        LEFT JOIN vsa_students s ON (s.batch_id = b.batch_id OR LOWER(TRIM(s.batch_name)) = LOWER(TRIM(b.batch_name)))
        GROUP BY b.batch_id
        ORDER BY b.batch_name ASC
    ');
    $batches = $stmt->fetchAll();
    $map = [];
    foreach ($batches as $b) {
        $b['batch_id'] = intval($b['batch_id']);
        $b['student_count'] = intval($b['student_count'] ?? 0);
        $map[$b['batch_id']] = $b;
    }
    return $map;
}

// ── Helper: Format enriched item payload ────────────────────────────────────
function formatItemPayload($row, $batchesMap) {
    $allocations = safeDecodeJson($row['allocations'], []);
    $stockHistory = safeDecodeJson($row['stock_history'], []);
    $totalQty = intval($row['total_quantity'] ?? 0);
    $allocatedQty = calculateAllocatedQuantity($allocations);
    $availableQty = max(0, $totalQty - $allocatedQty);

    $enrichedAllocations = [];
    foreach ($allocations as $alloc) {
        $bId = intval($alloc['batch_id'] ?? 0);
        $qty = intval($alloc['quantity'] ?? 0);
        if ($qty <= 0) continue;

        if (isset($batchesMap[$bId])) {
            $batchInfo = $batchesMap[$bId];
            $enrichedAllocations[] = [
                'batch_id'       => $bId,
                'batch_name'     => $batchInfo['batch_name'],
                'batch_location' => $batchInfo['batch_location'] ?? '',
                'quantity'       => $qty
            ];
        } else {
            // Orphaned batch reference handled gracefully
            $enrichedAllocations[] = [
                'batch_id'       => $bId,
                'batch_name'     => "Batch #{$bId} (Archived)",
                'batch_location' => '',
                'quantity'       => $qty
            ];
        }
    }

    return [
        'inventory_id'       => intval($row['inventory_id']),
        'item_name'          => $row['item_name'],
        'total_quantity'     => $totalQty,
        'allocated_quantity' => $allocatedQty,
        'available_quantity' => $availableQty,
        'allocations'        => $enrichedAllocations,
        'stock_history'      => $stockHistory,
        'created_at'         => $row['created_at'],
        'updated_at'         => $row['updated_at']
    ];
}

// ── GET: Fetch Inventory (Academy-Wide) ──────────────────────────────────────
if ($method === 'GET') {
    $id = intval($_GET['id'] ?? 0);
    $search = trim($_GET['search'] ?? '');

    try {
        $batchesMap = getBatchesMap($pdo);

        if ($id > 0) {
            $stmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                respondError('Inventory item not found.', 404);
            }
            respondSuccess([
                'item'    => formatItemPayload($row, $batchesMap),
                'batches' => array_values($batchesMap)
            ]);
        }

        $query = 'SELECT * FROM vsa_inventory';
        $params = [];
        if (!empty($search)) {
            $query .= ' WHERE item_name LIKE ?';
            $params[] = '%' . $search . '%';
        }
        $query .= ' ORDER BY item_name ASC';

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $items = [];
        foreach ($rows as $r) {
            $items[] = formatItemPayload($r, $batchesMap);
        }

        // Build enriched batch summaries for the Batch View
        $enrichedBatches = [];
        foreach ($batchesMap as $bId => $bInfo) {
            $totalUnits = 0;
            $typesCount = 0;
            $lastDate = null;
            $allocatedEquipment = [];

            foreach ($rows as $r) {
                $allocs = safeDecodeJson($r['allocations'], []);
                $hist = safeDecodeJson($r['stock_history'], []);

                foreach ($allocs as $al) {
                    if (intval($al['batch_id'] ?? 0) === $bId && intval($al['quantity'] ?? 0) > 0) {
                        $qty = intval($al['quantity']);
                        $totalUnits += $qty;
                        $typesCount++;

                        // Find latest allocation date and reason in stock_history
                        $itemAllocDate = null;
                        $itemReason = null;
                        for ($i = count($hist) - 1; $i >= 0; $i--) {
                            if (isset($hist[$i]['batch_id']) && intval($hist[$i]['batch_id']) === $bId && ($hist[$i]['type'] === 'Allocated' || $hist[$i]['type'] === 'Allocation')) {
                                $itemAllocDate = $hist[$i]['created_at'];
                                $itemReason = $hist[$i]['reason'] ?? '';
                                break;
                            }
                        }

                        if (!$itemAllocDate) {
                            $itemAllocDate = $r['updated_at'] ?: $r['created_at'];
                        }
                        if (!$itemReason) {
                            $itemReason = 'Training equipment allocation';
                        }

                        if (!$lastDate || strtotime($itemAllocDate) > strtotime($lastDate)) {
                            $lastDate = $itemAllocDate;
                        }

                        $allocatedEquipment[] = [
                            'inventory_id'    => intval($r['inventory_id']),
                            'item_name'       => $r['item_name'],
                            'quantity'        => $qty,
                            'total_quantity'  => intval($r['total_quantity']),
                            'allocation_date' => $itemAllocDate,
                            'reason'          => $itemReason
                        ];
                    }
                }
            }

            $bInfo['total_allocated_units'] = $totalUnits;
            $bInfo['equipment_types_count'] = $typesCount;
            $bInfo['last_allocation_date']  = $lastDate;
            $bInfo['allocated_equipment']   = $allocatedEquipment;
            $enrichedBatches[] = $bInfo;
        }

        respondSuccess([
            'items'   => $items,
            'batches' => $enrichedBatches
        ]);
    } catch (PDOException $e) {
        respondError('Database error: ' . $e->getMessage(), 500);
    }
}

// ── DELETE: Delete Inventory Item ───────────────────────────────────────────
if ($method === 'DELETE' || ($method === 'POST' && ($input['action'] ?? '') === 'delete')) {
    $inventory_id = intval($input['inventory_id'] ?? $_GET['inventory_id'] ?? 0);
    if ($inventory_id <= 0) {
        respondError('Valid inventory_id is required.', 400);
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ? FOR UPDATE');
        $stmt->execute([$inventory_id]);
        $row = $stmt->fetch();

        if (!$row) {
            $pdo->rollBack();
            respondError('Inventory item not found.', 404);
        }

        $allocations = safeDecodeJson($row['allocations'], []);
        $allocatedQty = calculateAllocatedQuantity($allocations);

        if ($allocatedQty > 0) {
            $pdo->rollBack();
            respondError("Cannot delete this inventory item because {$allocatedQty} item(s) are currently allocated to batches. Please deallocate all equipment first.", 400);
        }

        $delStmt = $pdo->prepare('DELETE FROM vsa_inventory WHERE inventory_id = ?');
        $delStmt->execute([$inventory_id]);

        $pdo->commit();
        respondSuccess(['message' => 'Inventory item deleted successfully.']);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondError('Operation failed: ' . $e->getMessage(), 500);
    }
}

// ── POST: Actions (create, add_stock, deduct_stock, allocate, deallocate) ───
if ($method === 'POST') {
    $action = trim($input['action'] ?? 'create');

    // 1. CREATE NEW INVENTORY ITEM
    if ($action === 'create') {
        $itemName = trim($input['item_name'] ?? '');
        $initialQty = intval($input['initial_quantity'] ?? 0);

        if (empty($itemName)) {
            respondError('Item name is required.', 400);
        }

        if ($initialQty < 0) {
            respondError('Initial quantity must be 0 or greater.', 400);
        }

        try {
            // Check for duplicate name
            $checkStmt = $pdo->prepare('SELECT inventory_id FROM vsa_inventory WHERE LOWER(TRIM(item_name)) = LOWER(TRIM(?))');
            $checkStmt->execute([$itemName]);
            if ($checkStmt->fetch()) {
                respondError('An inventory item with this name already exists.', 400);
            }

            $allocations = [];
            $stockHistory = [];
            if ($initialQty > 0) {
                $stockHistory[] = [
                    'type'       => 'Added',
                    'quantity'   => $initialQty,
                    'reason'     => 'Initial inventory purchase',
                    'created_at' => date('Y-m-d H:i:s')
                ];
            }

            $stmt = $pdo->prepare('
                INSERT INTO vsa_inventory (item_name, total_quantity, allocations, stock_history)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([
                $itemName,
                $initialQty,
                json_encode($allocations),
                json_encode($stockHistory)
            ]);

            $newId = intval($pdo->lastInsertId());
            $batchesMap = getBatchesMap($pdo);

            $fetchStmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ?');
            $fetchStmt->execute([$newId]);
            $newItem = $fetchStmt->fetch();

            respondSuccess([
                'message' => 'Inventory item created successfully.',
                'item'    => formatItemPayload($newItem, $batchesMap)
            ], 201);
        } catch (Exception $e) {
            respondError('Creation failed: ' . $e->getMessage(), 500);
        }
    }

    // 2. ADD STOCK
    if ($action === 'add_stock') {
        $inventory_id = intval($input['inventory_id'] ?? 0);
        $addedQty = intval($input['quantity'] ?? 0);
        $reason = trim($input['reason'] ?? '');

        if ($inventory_id <= 0) {
            respondError('Valid inventory_id is required.', 400);
        }

        if ($addedQty <= 0) {
            respondError('Added quantity must be greater than 0.', 400);
        }

        if (empty($reason)) {
            $reason = 'Stock replenishment';
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ? FOR UPDATE');
            $stmt->execute([$inventory_id]);
            $row = $stmt->fetch();

            if (!$row) {
                $pdo->rollBack();
                respondError('Inventory item not found.', 404);
            }

            $currentTotal = intval($row['total_quantity']);
            $newTotal = $currentTotal + $addedQty;

            $stockHistory = safeDecodeJson($row['stock_history'], []);
            $stockHistory[] = [
                'type'       => 'Added',
                'quantity'   => $addedQty,
                'reason'     => $reason,
                'created_at' => date('Y-m-d H:i:s')
            ];

            $updateStmt = $pdo->prepare('
                UPDATE vsa_inventory
                SET total_quantity = ?, stock_history = ?, updated_at = NOW()
                WHERE inventory_id = ?
            ');
            $updateStmt->execute([$newTotal, json_encode($stockHistory), $inventory_id]);

            $pdo->commit();

            $batchesMap = getBatchesMap($pdo);
            $stmt->execute([$inventory_id]);
            $updatedRow = $stmt->fetch();

            respondSuccess([
                'message' => "Successfully added {$addedQty} items to stock.",
                'item'    => formatItemPayload($updatedRow, $batchesMap)
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError('Stock addition failed: ' . $e->getMessage(), 500);
        }
    }

    // 3. DEDUCT STOCK (From Available Stock OR Allocated Batch Stock)
    if ($action === 'deduct_stock') {
        $inventory_id = intval($input['inventory_id'] ?? 0);
        $deductSource = trim(strval($input['deduct_source'] ?? 'available'));
        $deductedQty = intval($input['quantity'] ?? 0);
        $reason = trim($input['reason'] ?? '');
        $batch_id = intval($input['batch_id'] ?? 0);

        if ($inventory_id <= 0) {
            respondError('Valid inventory_id is required.', 400);
        }

        if ($deductedQty <= 0) {
            respondError('Deducted quantity must be greater than 0.', 400);
        }

        if (empty($reason)) {
            $reason = 'Damaged/Expired equipment';
        }

        if (!in_array($deductSource, ['available', 'allocated'], true)) {
            respondError('Invalid deduct_source specified. Must be "available" or "allocated".', 400);
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ? FOR UPDATE');
            $stmt->execute([$inventory_id]);
            $row = $stmt->fetch();

            if (!$row) {
                $pdo->rollBack();
                respondError('Inventory item not found.', 404);
            }

            $currentTotal = intval($row['total_quantity']);
            $allocations = safeDecodeJson($row['allocations'], []);
            $allocatedQty = calculateAllocatedQuantity($allocations);
            $availableQty = max(0, $currentTotal - $allocatedQty);

            $stockHistory = safeDecodeJson($row['stock_history'], []);
            $batchesMap = getBatchesMap($pdo);

            if ($deductSource === 'available') {
                if ($deductedQty > $availableQty) {
                    $pdo->rollBack();
                    respondError("Cannot deduct {$deductedQty} items. Only {$availableQty} item(s) currently available in unallocated stock.", 400);
                }

                $newTotal = $currentTotal - $deductedQty;

                $stockHistory[] = [
                    'type'       => 'Deducted',
                    'quantity'   => $deductedQty,
                    'source'     => 'Available Stock',
                    'reason'     => $reason,
                    'created_at' => date('Y-m-d H:i:s')
                ];

                $updateStmt = $pdo->prepare('
                    UPDATE vsa_inventory
                    SET total_quantity = ?, stock_history = ?, updated_at = NOW()
                    WHERE inventory_id = ?
                ');
                $updateStmt->execute([$newTotal, json_encode($stockHistory), $inventory_id]);

                $msg = "Successfully deducted {$deductedQty} items from available stock.";
            } else {
                // Deduct from Allocated Stock
                if ($batch_id <= 0) {
                    $pdo->rollBack();
                    respondError('Valid batch_id is required when deducting from allocated stock.', 400);
                }

                $foundBatchIndex = null;
                $batchCurrentAlloc = 0;

                foreach ($allocations as $idx => $alloc) {
                    if (intval($alloc['batch_id'] ?? 0) === $batch_id) {
                        $foundBatchIndex = $idx;
                        $batchCurrentAlloc = intval($alloc['quantity'] ?? 0);
                        break;
                    }
                }

                if ($foundBatchIndex === null || $batchCurrentAlloc <= 0) {
                    $pdo->rollBack();
                    respondError('Selected batch does not have any equipment allocated for this item.', 400);
                }

                if ($deductedQty > $batchCurrentAlloc) {
                    $pdo->rollBack();
                    $batchName = $batchesMap[$batch_id]['batch_name'] ?? "Batch #{$batch_id}";
                    respondError("Cannot deduct {$deductedQty} items from {$batchName}. Only {$batchCurrentAlloc} item(s) currently allocated.", 400);
                }

                // Reduce allocation or remove entry if remaining is 0
                $remainingBatchQty = $batchCurrentAlloc - $deductedQty;
                if ($remainingBatchQty > 0) {
                    $allocations[$foundBatchIndex]['quantity'] = $remainingBatchQty;
                } else {
                    unset($allocations[$foundBatchIndex]);
                }
                $allocations = array_values($allocations);

                $newTotal = $currentTotal - $deductedQty;
                $newAllocatedQty = calculateAllocatedQuantity($allocations);

                // Invariant assertions
                if ($newTotal < 0 || $newAllocatedQty > $newTotal) {
                    $pdo->rollBack();
                    respondError('Deduction would result in inconsistent inventory state.', 400);
                }

                $batchName = $batchesMap[$batch_id]['batch_name'] ?? "Batch #{$batch_id}";

                $stockHistory[] = [
                    'type'       => 'Deducted',
                    'quantity'   => $deductedQty,
                    'source'     => 'Allocated Stock',
                    'batch_id'   => $batch_id,
                    'batch_name' => $batchName,
                    'reason'     => $reason,
                    'created_at' => date('Y-m-d H:i:s')
                ];

                $updateStmt = $pdo->prepare('
                    UPDATE vsa_inventory
                    SET total_quantity = ?, allocations = ?, stock_history = ?, updated_at = NOW()
                    WHERE inventory_id = ?
                ');
                $updateStmt->execute([$newTotal, json_encode($allocations), json_encode($stockHistory), $inventory_id]);

                $msg = "Successfully deducted {$deductedQty} items from {$batchName} allocation.";
            }

            $pdo->commit();

            // Re-fetch updated row to return fresh payload
            $stmt->execute([$inventory_id]);
            $updatedRow = $stmt->fetch();

            respondSuccess([
                'message' => $msg,
                'item'    => formatItemPayload($updatedRow, $batchesMap)
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError('Stock deduction failed: ' . $e->getMessage(), 500);
        }
    }

    // 4. ALLOCATE EQUIPMENT TO BATCH
    if ($action === 'allocate') {
        $inventory_id = intval($input['inventory_id'] ?? 0);
        $batch_id = intval($input['batch_id'] ?? 0);
        $allocQty = intval($input['quantity'] ?? 0);
        $reason = trim(strval($input['reason'] ?? ''));

        if ($inventory_id <= 0 || $batch_id <= 0) {
            respondError('Valid inventory_id and batch_id are required.', 400);
        }

        if ($allocQty <= 0) {
            respondError('Allocation quantity must be greater than 0.', 400);
        }

        if ($reason === '') {
            respondError('Reason for allocation is required.', 400);
        }

        // Verify batch exists in vsa_batches
        $batchStmt = $pdo->prepare('SELECT batch_id, batch_name FROM vsa_batches WHERE batch_id = ?');
        $batchStmt->execute([$batch_id]);
        $batch = $batchStmt->fetch();
        if (!$batch) {
            respondError('Selected batch does not exist.', 404);
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ? FOR UPDATE');
            $stmt->execute([$inventory_id]);
            $row = $stmt->fetch();

            if (!$row) {
                $pdo->rollBack();
                respondError('Inventory item not found.', 404);
            }

            $totalQty = intval($row['total_quantity']);
            $allocations = safeDecodeJson($row['allocations'], []);
            $allocatedQty = calculateAllocatedQuantity($allocations);
            $availableQty = max(0, $totalQty - $allocatedQty);

            if ($allocQty > $availableQty) {
                $pdo->rollBack();
                respondError("Cannot allocate {$allocQty} items. Only {$availableQty} items are currently available.", 400);
            }

            // Update existing batch entry if already present, otherwise append
            $found = false;
            foreach ($allocations as &$alloc) {
                if (intval($alloc['batch_id']) === $batch_id) {
                    $alloc['quantity'] = intval($alloc['quantity']) + $allocQty;
                    $found = true;
                    break;
                }
            }
            unset($alloc);

            if (!$found) {
                $allocations[] = [
                    'batch_id' => $batch_id,
                    'quantity' => $allocQty
                ];
            }

            // Safety assertion: allocated quantity cannot exceed total quantity
            $newAllocated = calculateAllocatedQuantity($allocations);
            if ($newAllocated > $totalQty) {
                $pdo->rollBack();
                respondError('Allocation calculation error: allocated exceeds total.', 400);
            }

            // Record complete stock history for allocation
            $stockHistory = safeDecodeJson($row['stock_history'], []);
            $stockHistory[] = [
                'type'       => 'Allocated',
                'quantity'   => $allocQty,
                'batch_id'   => $batch_id,
                'batch_name' => $batch['batch_name'],
                'reason'     => $reason,
                'created_at' => date('Y-m-d H:i:s')
            ];

            $updateStmt = $pdo->prepare('
                UPDATE vsa_inventory
                SET allocations = ?, stock_history = ?, updated_at = NOW()
                WHERE inventory_id = ?
            ');
            $updateStmt->execute([
                json_encode($allocations),
                json_encode($stockHistory),
                $inventory_id
            ]);

            $pdo->commit();

            $batchesMap = getBatchesMap($pdo);
            $stmt->execute([$inventory_id]);
            $updatedRow = $stmt->fetch();

            respondSuccess([
                'message' => "Successfully allocated {$allocQty} items to {$batch['batch_name']}.",
                'item'    => formatItemPayload($updatedRow, $batchesMap)
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError('Allocation failed: ' . $e->getMessage(), 500);
        }
    }

    // 5. DEALLOCATE EQUIPMENT FROM BATCH
    if ($action === 'deallocate') {
        $inventory_id = intval($input['inventory_id'] ?? 0);
        $batch_id = intval($input['batch_id'] ?? 0);
        $deallocQty = intval($input['quantity'] ?? 0);
        $reason = trim(strval($input['reason'] ?? ''));

        if ($inventory_id <= 0 || $batch_id <= 0) {
            respondError('Valid inventory_id and batch_id are required.', 400);
        }

        if ($deallocQty <= 0) {
            respondError('Deallocation quantity must be greater than 0.', 400);
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('SELECT * FROM vsa_inventory WHERE inventory_id = ? FOR UPDATE');
            $stmt->execute([$inventory_id]);
            $row = $stmt->fetch();

            if (!$row) {
                $pdo->rollBack();
                respondError('Inventory item not found.', 404);
            }

            $allocations = safeDecodeJson($row['allocations'], []);
            $foundIndex = -1;
            $currentBatchQty = 0;

            foreach ($allocations as $idx => $alloc) {
                if (intval($alloc['batch_id']) === $batch_id) {
                    $foundIndex = $idx;
                    $currentBatchQty = intval($alloc['quantity']);
                    break;
                }
            }

            if ($foundIndex === -1 || $currentBatchQty <= 0) {
                $pdo->rollBack();
                respondError('This batch currently has no equipment allocated for this item.', 400);
            }

            if ($deallocQty > $currentBatchQty) {
                $pdo->rollBack();
                respondError("Cannot deallocate {$deallocQty} items. Batch currently only has {$currentBatchQty} allocated.", 400);
            }

            $newBatchQty = $currentBatchQty - $deallocQty;
            if ($newBatchQty <= 0) {
                // Remove the batch entry completely if quantity becomes 0
                array_splice($allocations, $foundIndex, 1);
            } else {
                $allocations[$foundIndex]['quantity'] = $newBatchQty;
            }

            // Look up batch name for history record
            $batchStmt = $pdo->prepare('SELECT batch_id, batch_name FROM vsa_batches WHERE batch_id = ?');
            $batchStmt->execute([$batch_id]);
            $batchRow = $batchStmt->fetch();
            $batchName = $batchRow ? $batchRow['batch_name'] : "Batch #{$batch_id}";

            // Record complete stock history for deallocation
            $stockHistory = safeDecodeJson($row['stock_history'], []);
            $stockHistory[] = [
                'type'       => 'Deallocated',
                'quantity'   => $deallocQty,
                'batch_id'   => $batch_id,
                'batch_name' => $batchName,
                'reason'     => !empty($reason) ? $reason : 'Returned from batch',
                'created_at' => date('Y-m-d H:i:s')
            ];

            $updateStmt = $pdo->prepare('
                UPDATE vsa_inventory
                SET allocations = ?, stock_history = ?, updated_at = NOW()
                WHERE inventory_id = ?
            ');
            $updateStmt->execute([
                json_encode($allocations),
                json_encode($stockHistory),
                $inventory_id
            ]);

            $pdo->commit();

            $batchesMap = getBatchesMap($pdo);
            $stmt->execute([$inventory_id]);
            $updatedRow = $stmt->fetch();

            respondSuccess([
                'message' => "Successfully deallocated {$deallocQty} items from batch.",
                'item'    => formatItemPayload($updatedRow, $batchesMap)
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respondError('Deallocation failed: ' . $e->getMessage(), 500);
        }
    }

    respondError("Unknown action: {$action}", 400);
}

respondError('Method not allowed.', 405);
