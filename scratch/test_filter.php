<?php
$res10 = file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=student_batch&batch_id=10');
$json10 = json_decode($res10, true);
echo "Filter batch_id=10: Total students returned = " . count($json10['data']['table_rows']) . " (Expected: 10)\n";

$res7 = file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=student_batch&batch_id=7');
$json7 = json_decode($res7, true);
echo "Filter batch_id=7: Total students returned = " . count($json7['data']['table_rows']) . " (Expected: 1)\n";
