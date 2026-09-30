<?php
require_once __DIR__ . '/../server/db_connect.php';
$_SERVER['HTTP_X_VAVA_ROLE'] = 'superadmin';
$_GET['action'] = 'none';
require_once __DIR__ . '/../server/reports.php';

$auth = ['role' => 'superadmin', 'coach' => null];
$report = getReportData($pdo, 'fees_payments', [], $auth);

echo "Total records in fees_payments: " . count($report['table_rows']) . "\n";
echo "Summary Metrics:\n";
foreach ($report['summary_metrics'] as $sm) {
    echo "  - {$sm['label']}: {$sm['value']} ({$sm['subtext']})\n";
}
echo "Sample table row:\n";
if (!empty($report['table_rows'])) {
    print_r($report['table_rows'][0]);
}
