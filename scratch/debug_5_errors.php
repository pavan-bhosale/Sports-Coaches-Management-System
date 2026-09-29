<?php
require_once __DIR__ . '/../server/db_connect.php';

$endpoints = [
    'filter_options' => 'http://localhost/VAVA_sports/server/reports.php?action=filter_options',
    'student_batch' => 'http://localhost/VAVA_sports/server/reports.php?action=get_report&report=student_batch',
    'coach_activity' => 'http://localhost/VAVA_sports/server/reports.php?action=get_report&report=coach_activity'
];

foreach ($endpoints as $k => $url) {
    echo "=== $k ===\n";
    $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
    $res = file_get_contents($url, false, $ctx);
    echo "Response:\n" . $res . "\n\n";
}
