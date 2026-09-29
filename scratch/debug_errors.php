<?php
$context = stream_context_create(['http' => ['ignore_errors' => true]]);
foreach (['coach_roster', 'fee_collection', 'student_fee_history'] as $r) {
    $url = "http://localhost/VAVA_sports/server/reports.php?action=get_report&report={$r}&batch_id=999999&coach_id=999999&student_id=999999&start_date=2099-01-01&end_date=2099-01-31&month=2099-01&status=NONEXISTENT_STATUS";
    $res = file_get_contents($url, false, $context);
    echo "=== {$r} ===\n";
    echo substr($res, 0, 300) . "\n\n";
}
