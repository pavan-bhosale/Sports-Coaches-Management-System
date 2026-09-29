<?php
$content = file_get_contents('server/reports.php');
$lines = explode("\n", $content);
foreach ($lines as $i => $l) {
    if (strpos($l, 'return $report;') !== false) {
        echo ($i + 1) . ": " . trim($l) . "\n";
    }
}
