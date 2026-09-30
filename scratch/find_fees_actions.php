<?php
$lines = file('server/fees.php');
foreach ($lines as $i => $line) {
    if (preg_match('/\$action\s*===?\s*[\'"][^\'"]+[\'"]/', $line)) {
        echo ($i + 1) . ": " . trim($line) . "\n";
    }
}
