<?php
$ctx = stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => "Origin: http://127.0.0.1:5500\r\n"
    ]
]);

$res = file_get_contents('http://localhost/VAVA_sports/server/reports.php?action=filter_options', false, $ctx);
echo "=== Response Headers ===\n";
foreach ($http_response_header as $h) {
    if (stripos($h, 'access-control') !== false || stripos($h, 'content-type') !== false) {
        echo $h . "\n";
    }
}

$json = json_decode($res, true);
echo "\n=== JSON Body ===\n";
echo "Success: " . (!empty($json['success']) ? 'YES' : 'NO') . "\n";
echo "Batches returned: " . count($json['data']['batches'] ?? []) . "\n";
