<?php
$res = file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=student_batch');
$json = json_decode($res, true);
echo "SUCCESS: " . ($json['success'] ? 'true' : 'false') . "\n";
echo "SUMMARY METRICS:\n";
foreach ($json['data']['summary_metrics'] as $m) {
    echo "  {$m['label']}: {$m['value']} ({$m['subtext']})\n";
}
echo "\nBATCH SUMMARY (Batches with students):\n";
foreach ($json['data']['batch_summary']['rows'] as $r) {
    if ($r[4] > 0) {
        echo "  Batch: {$r[0]} | Coach: {$r[1]} | Schedule: {$r[3]} | Count: {$r[4]}\n";
    }
}
echo "\nSTUDENT ROWS:\n";
foreach ($json['data']['table_rows'] as $s) {
    echo "  Student: {$s[0]} | Batch: {$s[1]} | Coach: {$s[2]} | Status: {$s[5]}\n";
}
