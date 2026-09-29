<?php
require_once __DIR__ . '/../server/db_connect.php';

$res = file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=get_report&report=student_overview');
$json = json_decode($res, true);
$data = $json['data'] ?? [];

echo "Title: " . ($data['title'] ?? '') . "\n";
echo "table_headers: " . count($data['table_headers'] ?? []) . "\n";
echo "table_rows: " . count($data['table_rows'] ?? []) . "\n";
echo "summary_metrics: " . json_encode($data['summary_metrics'] ?? []) . "\n";
echo "chart: " . json_encode($data['chart'] ?? []) . "\n";
