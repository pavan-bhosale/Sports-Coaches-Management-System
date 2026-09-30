<?php
$lines = file('server/reports.php');
foreach ($lines as $i => $line) {
    if (preg_match('/^\s*(case\s+[\'"][^\'"]+[\'"]|function\s+\w+|default:)/', $line, $m)) {
        echo ($i + 1) . ": " . trim($line) . "\n";
    }
}
