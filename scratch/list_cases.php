<?php
$content = file_get_contents('server/reports.php');

// Find all case statements
preg_match_all("/case '([a-z_]+)':/i", $content, $matches);
echo "Reports found: " . count($matches[1]) . "\n";
foreach ($matches[1] as $r) {
    echo "- " . $r . "\n";
}
