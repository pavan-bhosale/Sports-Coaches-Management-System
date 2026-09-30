<?php
$lines = file('server/reports.php');
$attStart = 0; $attEnd = 0;
$feeStart = 0; $feeEnd = 0;

foreach ($lines as $i => $l) {
    if (strpos($l, "case 'attendance_report':") !== false) $attStart = $i;
    if (strpos($l, "case 'fees_payments':") !== false) { $attEnd = $i - 1; $feeStart = $i; }
    if (strpos($l, "case 'coach_activity':") !== false) { $feeEnd = $i - 1; }
}

echo "attendance_report: lines " . ($attStart + 1) . " to " . ($attEnd + 1) . "\n";
echo "fees_payments: lines " . ($feeStart + 1) . " to " . ($feeEnd + 1) . "\n";
