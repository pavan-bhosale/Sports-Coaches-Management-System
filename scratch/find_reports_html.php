<?php
$lines = file('dashboard.html');
foreach ($lines as $i => $line) {
    if (stripos($line, 'report') !== false) {
        echo ($i + 1) . ": " . trim(substr($line, 0, 100)) . "\n";
    }
}
