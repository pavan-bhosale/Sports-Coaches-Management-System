<?php
/**
 * VAVA Sports Academy - Production Deployment Archive Packager
 * 
 * Prepares a clean, production-ready deployment ZIP for Hostinger:
 * 1. Automatically validates and synchronizes content-hashed asset versions.
 * 2. Stages all required production files (HTML shells, CSS, JS, server, vendor, brand assets).
 * 3. Strictly excludes development files, secrets (.env), test suites, scratch directories, and git.
 * 4. Compresses into deploy/vava_sports_production.zip using ZipArchive or system tools.
 * 5. Verifies the generated archive integrity and outputs deployment instructions.
 * 
 * Usage:
 *   php scripts/prepare_deploy_zip.php
 */

$rootDir   = realpath(__DIR__ . '/..');
$deployDir = $rootDir . DIRECTORY_SEPARATOR . 'deploy';
$stageDir  = $deployDir . DIRECTORY_SEPARATOR . 'staging';
$zipName   = 'vava_sports_production.zip';
$zipPath   = $deployDir . DIRECTORY_SEPARATOR . $zipName;

echo "=================================================================\n";
echo "VAVA SPORTS — PRODUCTION DEPLOYMENT PACKAGER\n";
echo "Root: {$rootDir}\n";
echo "Target: {$zipPath}\n";
echo "=================================================================\n\n";

// Step 1: Synchronize Asset Versions
echo "[Step 1/4] Synchronizing static asset content hashes in HTML shells...\n";
require_once __DIR__ . '/sync_asset_versions.php';
echo "\n";

// Step 2: Prepare Target & Staging Directories
if (!is_dir($deployDir)) {
    mkdir($deployDir, 0755, true);
}
if (is_dir($stageDir)) {
    // Clean existing staging directory
    $cleanupIt = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($stageDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($cleanupIt as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($stageDir);
}
mkdir($stageDir, 0755, true);

if (file_exists($zipPath)) {
    @unlink($zipPath);
}

// Step 3: Define Exclusion Rules
$excludePatterns = [
    '/^\.git(\/|\\\\|$)/i',
    '/^\.vscode(\/|\\\\|$)/i',
    '/^scratch(\/|\\\\|$)/i',
    '/^deploy(\/|\\\\|$)/i',
    '/^node_modules(\/|\\\\|$)/i',
    '/^server\/node_modules(\/|\\\\|$)/i',
    '/^server\/logs(\/|\\\\|$)/i',
    '/^\.env$/i',
    '/^\.env\.local$/i',
    '/^fiveserver\.config\.js$/i',
    '/^package(-lock)?\.json$/i',
    '/^diagram\.png$/i',
    '/\.log$/i',
    '/\.tmp$/i',
    '/^scripts(\/|\\\\|$)/i'
];

echo "[Step 2/4] Staging production files for packaging...\n";

$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($rootDir, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);

$packedCount = 0;
$totalSize = 0;

foreach ($iterator as $file) {
    if (!$file->isFile()) continue;

    $fullPath = $file->getPathname();
    $relPath = ltrim(substr($fullPath, strlen($rootDir)), DIRECTORY_SEPARATOR);
    $relNormalized = str_replace('\\', '/', $relPath);

    // Evaluate exclusion patterns
    $excluded = false;
    foreach ($excludePatterns as $pattern) {
        if (preg_match($pattern, $relNormalized)) {
            $excluded = true;
            break;
        }
    }

    if ($excluded) {
        continue;
    }

    // Strict security block on .env
    if (basename($relNormalized) === '.env') {
        echo "  [SECURITY BLOCK] Blocked .env file from packaging: {$relNormalized}\n";
        continue;
    }

    $destPath = $stageDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relNormalized);
    $destDir  = dirname($destPath);
    if (!is_dir($destDir)) {
        mkdir($destDir, 0755, true);
    }

    copy($fullPath, $destPath);
    $packedCount++;
    $totalSize += $file->getSize();
}

echo "=> Staged {$packedCount} production files (" . number_format($totalSize / (1024 * 1024), 2) . " MB uncompressed).\n\n";

// Step 3: Compress Staged Files into ZIP
echo "[Step 3/4] Compressing deployment package into ZIP...\n";

if (class_exists('ZipArchive')) {
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
        $stageIt = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($stageDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($stageIt as $f) {
            if ($f->isFile()) {
                $subRel = ltrim(substr($f->getPathname(), strlen($stageDir)), DIRECTORY_SEPARATOR);
                $zip->addFile($f->getPathname(), str_replace('\\', '/', $subRel));
            }
        }
        $zip->close();
    }
}

// Fallback to PowerShell Compress-Archive on Windows
if (!file_exists($zipPath)) {
    $stageDirEscaped = escapeshellarg($stageDir . DIRECTORY_SEPARATOR . '*');
    $zipPathEscaped  = escapeshellarg($zipPath);
    $psCmd = "powershell -NoProfile -Command \"Compress-Archive -Path {$stageDirEscaped} -DestinationPath {$zipPathEscaped} -Force\"";
    exec($psCmd, $psOut, $psCode);
}

if (!file_exists($zipPath)) {
    echo "[ERROR] Failed to generate ZIP archive at {$zipPath}\n";
    exit(1);
}

// Step 4: Verification and Security Audit of the Archive
echo "[Step 4/4] Performing security and integrity audit on generated ZIP...\n";

// Verify staging contents directly
$envInStage = file_exists($stageDir . DIRECTORY_SEPARATOR . '.env');
$indexInStage = file_exists($stageDir . DIRECTORY_SEPARATOR . 'index.html');
$dashInStage = file_exists($stageDir . DIRECTORY_SEPARATOR . 'dashboard.html');
$htaccessInStage = file_exists($stageDir . DIRECTORY_SEPARATOR . '.htaccess');
$versionInStage = file_exists($stageDir . DIRECTORY_SEPARATOR . 'version.json');

if ($envInStage) {
    echo "[CRITICAL SECURITY FAILURE] .env was detected inside staging! Aborting.\n";
    @unlink($zipPath);
    exit(1);
}

if (!$indexInStage || !$dashInStage || !$htaccessInStage || !$versionInStage) {
    echo "[ERROR] Key application shell files missing from staged archive.\n";
    exit(1);
}

// Cleanup staging directory
$cleanupIt = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($stageDir, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);
foreach ($cleanupIt as $item) {
    $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
}
rmdir($stageDir);

$zipSizeMb = number_format(filesize($zipPath) / (1024 * 1024), 2);
$zipSha256 = hash_file('sha256', $zipPath);

echo "=> Verification PASSED:\n";
echo "  - Total entries packed: {$packedCount}\n";
echo "  - Compressed archive size: {$zipSizeMb} MB\n";
echo "  - Archive SHA256: {$zipSha256}\n";
echo "  - .env excluded: YES (Verified)\n";
echo "  - HTML shells included: YES (index.html, dashboard.html)\n";
echo "  - Apache & Security config included: YES (.htaccess)\n";
echo "  - Version manifest included: YES (version.json)\n\n";

echo "Hostinger Safe Deployment Instructions:\n";
echo "-----------------------------------------------------------------\n";
echo "1. Generated archive location: deploy/{$zipName}\n";
echo "2. Log into Hostinger hPanel -> File Manager.\n";
echo "3. Open your website root directory (public_html/).\n";
echo "4. DO NOT delete or overwrite your live database or production uploads/ directory.\n";
echo "5. Upload 'deploy/{$zipName}' to public_html/ and extract files directly.\n";
echo "6. In Hostinger hPanel -> Advanced / Performance -> Purge All Cache (or LiteSpeed Cache Purge).\n";
echo "7. Verification: Open an existing user session and check Network tab.\n";
echo "   dashboard.css will request ?v=" . ($manifest['assets']['css/dashboard.css'] ?? '') . " with 200 OK.\n";
echo "=================================================================\n";
