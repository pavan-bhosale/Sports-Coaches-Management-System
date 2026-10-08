<?php
/**
 * VAVA Sports Academy - Centralized Configuration & Environment Loader
 * 
 * Safely loads environment variables from .env files or system environment.
 * Ensures credentials and secrets are never hardcoded in source files.
 * Zero external dependencies. Safe for both local XAMPP and Hostinger PHP environments.
 */

if (!function_exists('loadEnvFile')) {
    /**
     * Parses and loads key=value pairs from a .env file.
     * Preserves existing environment variables if already set.
     */
    function loadEnvFile($filePath) {
        if (!file_exists($filePath) || !is_readable($filePath)) {
            return;
        }

        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            // Skip comments and empty lines
            if (empty($line) || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                continue;
            }

            // Split into key and value
            list($name, $value) = explode('=', $line, 2);
            $name = trim($name);
            $value = trim($value);

            // Strip surrounding quotes
            if (strlen($value) >= 2) {
                $firstChar = $value[0];
                $lastChar = substr($value, -1);
                if (($firstChar === '"' && $lastChar === '"') || ($firstChar === "'" && $lastChar === "'")) {
                    $value = substr($value, 1, -1);
                }
            }

            // Only set if not already defined in environment
            if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV) && getenv($name) === false) {
                putenv("{$name}={$value}");
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }
    }
}

// Load .env from project root or server folder
$rootDir = dirname(__DIR__);
loadEnvFile($rootDir . DIRECTORY_SEPARATOR . '.env');
loadEnvFile(__DIR__ . DIRECTORY_SEPARATOR . '.env');

if (!function_exists('getEnvConfig')) {
    /**
     * Retrieves an environment configuration value with a fallback default.
     */
    function getEnvConfig($key, $default = null) {
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            return $val;
        }
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return $_ENV[$key];
        }
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return $_SERVER[$key];
        }
        return $default;
    }
}

if (!function_exists('getDbConfig')) {
    /**
     * Returns database connection parameters.
     * Prefers environment variables, with safe local XAMPP defaults if running locally.
     */
    function getDbConfig() {
        $httpHost = strtolower($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
        $hostOnly = !empty($httpHost) ? explode(':', $httpHost)[0] : '';
        $isLocalHost = ($hostOnly === 'localhost' || $hostOnly === '127.0.0.1');

        if (php_sapi_name() === 'cli') {
            $appEnv = strtolower(getEnvConfig('APP_ENV', ''));
            if ($appEnv === 'local' || $appEnv === 'development' || PHP_OS_FAMILY === 'Windows') {
                $isLocalHost = true;
            }
        }

        $defaultHost = 'localhost';
        $defaultDb   = $isLocalHost ? 'vava_sports' : 'u854506354_vavasports';
        $defaultUser = $isLocalHost ? 'root' : 'u854506354_vavasports';
        $defaultPass = '';

        return [
            'host'     => getEnvConfig('DB_HOST', $defaultHost),
            'dbname'   => getEnvConfig('DB_NAME', $defaultDb),
            'username' => getEnvConfig('DB_USER', $defaultUser),
            'password' => getEnvConfig('DB_PASSWORD', $defaultPass),
            'charset'  => getEnvConfig('DB_CHARSET', 'utf8mb4')
        ];
    }
}

if (!function_exists('getRazorpayConfig')) {
    /**
     * Returns Razorpay gateway credentials.
     */
    function getRazorpayConfig() {
        return [
            'key_id'         => getEnvConfig('RAZORPAY_KEY_ID', ''),
            'key_secret'     => getEnvConfig('RAZORPAY_KEY_SECRET', ''),
            'webhook_secret' => getEnvConfig('RAZORPAY_WEBHOOK_SECRET', ''),
            'currency'       => getEnvConfig('RAZORPAY_CURRENCY', 'INR')
        ];
    }
}

if (!function_exists('getGoogleConfig')) {
    /**
     * Returns Google OAuth configuration.
     */
    function getGoogleConfig() {
        return [
            'client_id' => getEnvConfig('GOOGLE_CLIENT_ID', '773475002367-kfmlifn4bn181tdlts94ss2q2jmisdaa.apps.googleusercontent.com')
        ];
    }
}

if (!function_exists('getTwilioConfig')) {
    /**
     * Returns Twilio WhatsApp credentials and settings.
     */
    function getTwilioConfig() {
        return [
            'account_sid'  => getEnvConfig('TWILIO_ACCOUNT_SID', ''),
            'auth_token'   => getEnvConfig('TWILIO_AUTH_TOKEN', ''),
            'from'         => getEnvConfig('TWILIO_WHATSAPP_FROM', 'whatsapp:+17372508034'),
            'content_sid'  => getEnvConfig('TWILIO_WHATSAPP_CONTENT_SID', ''),
            'sandbox'      => strtolower(getEnvConfig('TWILIO_WHATSAPP_SANDBOX', 'true')) === 'true'
        ];
    }
}

if (!function_exists('formatSafeErrorMessage')) {
    /**
     * Formats exception messages safely depending on environment.
     * In development/local mode, returns detailed diagnostic.
     * In production, logs full trace to error_log and returns a clean user-facing fallback.
     */
    function formatSafeErrorMessage(Throwable $e, string $fallback = 'A database error occurred. Please try again.') {
        error_log('[VAVA Error] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
        $appEnv = strtolower(getEnvConfig('APP_ENV', 'development'));
        if ($appEnv === 'development' || $appEnv === 'local') {
            return $e->getMessage();
        }
        return $fallback;
    }
}
?>
