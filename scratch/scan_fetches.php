<?php
$files = glob('js/*.js');
foreach ($files as $f) {
    $lines = file($f);
    foreach ($lines as $i => $line) {
        if (strpos($line, 'fetch(') !== false || strpos($line, 'X-VAVA-') !== false) {
            echo basename($f) . ":" . ($i + 1) . " -> " . trim($line) . "\n";
        }
    }
}
