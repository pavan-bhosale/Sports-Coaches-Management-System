<?php
/**
 * VAVA Sports Academy - Production Asset Version Synchronizer
 * 
 * Computes deterministic MD5 content hashes for all static CSS, JS, image, and manifest
 * assets referenced in index.html and dashboard.html. Replaces outdated or missing query
 * string version tags (?v=...) with verified content hashes.
 * 
 * Usage:
 *   php scripts/sync_asset_versions.php         # Updates index.html & dashboard.html
 *   php scripts/sync_asset_versions.php --check # Verifies if all tags match current disk hashes
 */

$rootDir = realpath(__DIR__ . '/..');
$isCheckOnly = in_array('--check', $argv ?? []);

$htmlFiles = ['index.html', 'dashboard.html'];
$manifest = [
    'app'          => 'VAVA Sports Academy',
    'timestamp'    => date('c'),
    'assets'       => [],
    'files_synced' => []
];

$allUpToDate = true;
$totalReplacements = 0;

$staticExtensions = 'css|js|png|jpg|jpeg|gif|webp|svg|ico|webmanifest|woff|woff2|ttf|eot';

echo "=================================================================\n";
echo "VAVA SPORTS — ASSET VERSION SYNCHRONIZER\n";
echo "Mode: " . ($isCheckOnly ? "VERIFY ONLY (--check)" : "APPLY UPDATES") . "\n";
echo "Root: {$rootDir}\n";
echo "=================================================================\n\n";

foreach ($htmlFiles as $htmlFileName) {
    $htmlPath = $rootDir . DIRECTORY_SEPARATOR . $htmlFileName;
    if (!file_exists($htmlPath)) {
        echo "[ERROR] File not found: {$htmlFileName}\n";
        continue;
    }

    $originalContent = file_get_contents($htmlPath);
    $modifiedContent = $originalContent;
    $fileReplacements = 0;

    echo "Scanning {$htmlFileName}...\n";

    $pattern = '/((?:href|src)=["\'])([^"\'?#]+\.(' . $staticExtensions . '))(?:\?([^"\'#]*))?(["\'])/i';

    $modifiedContent = preg_replace_callback($pattern, function ($matches) use ($rootDir, &$manifest, &$fileReplacements, &$allUpToDate, $htmlFileName) {
        $prefix    = $matches[1];
        $assetPath = $matches[2];
        $ext       = strtolower($matches[3]);
        $oldQuery  = $matches[4] ?? '';
        $suffix    = $matches[5];

        // Skip absolute URLs, data URIs, protocol-relative URLs
        if (preg_match('/^(https?:|\/\/|data:)/i', $assetPath)) {
            return $matches[0];
        }

        // Clean relative path
        $cleanRelPath = ltrim(str_replace('\\', '/', $assetPath), '/');
        $diskPath = $rootDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $cleanRelPath);

        if (!file_exists($diskPath) || is_dir($diskPath)) {
            return $matches[0];
        }

        // Compute 8-char MD5 content hash
        $contentHash = substr(md5_file($diskPath), 0, 8);
        $manifest['assets'][$cleanRelPath] = $contentHash;

        $newQuery = "v={$contentHash}";

        if ($oldQuery !== $newQuery) {
            $allUpToDate = false;
            $fileReplacements++;
            echo "  [UPDATE] {$cleanRelPath}: '{$oldQuery}' -> '{$newQuery}'\n";
        } else {
            echo "  [OK]     {$cleanRelPath}: '{$newQuery}'\n";
        }

        return "{$prefix}{$assetPath}?{$newQuery}{$suffix}";
    }, $modifiedContent);

    if (!$isCheckOnly && $modifiedContent !== $originalContent) {
        file_put_contents($htmlPath, $modifiedContent);
        echo "=> Saved updated {$htmlFileName} ({$fileReplacements} changes applied).\n\n";
        $manifest['files_synced'][] = $htmlFileName;
    } elseif ($isCheckOnly) {
        echo "=> {$htmlFileName}: {$fileReplacements} outdated asset reference(s).\n\n";
    } else {
        echo "=> {$htmlFileName}: Already completely up to date.\n\n";
    }

    $totalReplacements += $fileReplacements;
}

// Generate overall release build hash from all asset hashes
ksort($manifest['assets']);
$manifest['build_hash'] = substr(md5(json_encode($manifest['assets'])), 0, 10);

if (!$isCheckOnly) {
    $manifestPath = $rootDir . DIRECTORY_SEPARATOR . 'version.json';
    file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    echo "Generated release version manifest: version.json (Build: {$manifest['build_hash']})\n";
}

echo "\n-----------------------------------------------------------------\n";
if (realpath($argv[0] ?? '') === realpath(__FILE__)) {
    if ($allUpToDate) {
        echo "SUCCESS: All frontend asset references are strictly up-to-date with disk.\n";
        exit(0);
    } else {
        if ($isCheckOnly) {
            echo "CHECK FAILED: {$totalReplacements} asset references are out of sync with disk.\n";
            exit(1);
        } else {
            echo "SUCCESS: Synchronized {$totalReplacements} asset references across all entry points.\n";
            exit(0);
        }
    }
}
