<?php
/**
 * VAVA Sports Academy - Twilio WhatsApp Sandbox Configuration & Service
 * 
 * Securely loads credentials from environment or local .env file.
 * Credentials are NEVER exposed to the frontend, JavaScript, or public repositories.
 */

// Load .env configuration safely
function loadEnvFile($filePath) {
    if (!file_exists($filePath) || !is_readable($filePath)) {
        return;
    }
    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (empty($line) || strpos($line, '#') === 0 || strpos($line, '=') === false) {
            continue;
        }
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv("$name=$value");
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }
}

// Load from project root or server directory
loadEnvFile(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env');
loadEnvFile(__DIR__ . DIRECTORY_SEPARATOR . '.env');

// Twilio Core Configuration
define('TWILIO_ACCOUNT_SID', getenv('TWILIO_ACCOUNT_SID') ?: ($_ENV['TWILIO_ACCOUNT_SID'] ?? ''));
define('TWILIO_AUTH_TOKEN', getenv('TWILIO_AUTH_TOKEN') ?: ($_ENV['TWILIO_AUTH_TOKEN'] ?? ''));
define('TWILIO_WHATSAPP_FROM', getenv('TWILIO_WHATSAPP_FROM') ?: ($_ENV['TWILIO_WHATSAPP_FROM'] ?? 'whatsapp:+17372508034'));
define('TWILIO_WHATSAPP_CONTENT_SID', getenv('TWILIO_WHATSAPP_CONTENT_SID') ?: ($_ENV['TWILIO_WHATSAPP_CONTENT_SID'] ?? ''));
define('TWILIO_WHATSAPP_SANDBOX', strtolower(getenv('TWILIO_WHATSAPP_SANDBOX') ?: ($_ENV['TWILIO_WHATSAPP_SANDBOX'] ?? 'true')) === 'true');

/**
 * Check whether Twilio credentials are configured.
 */
function isTwilioConfigured() {
    return !empty(TWILIO_ACCOUNT_SID) && !empty(TWILIO_AUTH_TOKEN);
}

/**
 * Normalize and validate phone numbers into Twilio WhatsApp format: whatsapp:+[E.164].
 * Correctly normalizes Indian phone numbers (10 digits, +91, trunk 0).
 * Rejects malformed numbers.
 */
function formatTwilioWhatsAppNumber($phone) {
    if (empty($phone)) return null;

    $clean = preg_replace('/[^\d+]/', '', trim((string)$phone));
    if (empty($clean)) return null;

    // Handle leading 00 (international format)
    if (strpos($clean, '00') === 0) {
        $clean = '+' . substr($clean, 2);
    }

    // Handle standard Indian 10-digit number (starts with 6, 7, 8, 9)
    if (preg_match('/^[6-9]\d{9}$/', $clean)) {
        return 'whatsapp:+91' . $clean;
    }

    // Handle Indian number with trunk 0 (e.g. 09876543210 -> +919876543210)
    if (preg_match('/^0([6-9]\d{9})$/', $clean, $matches)) {
        return 'whatsapp:+91' . $matches[1];
    }

    // Handle Indian number with 91 prefix without plus (e.g. 919876543210 -> +919876543210)
    if (preg_match('/^91([6-9]\d{9})$/', $clean, $matches)) {
        return 'whatsapp:+91' . $matches[1];
    }

    // Handle numbers with explicit plus prefix (+91...)
    if (strpos($clean, '+') === 0) {
        $digitsOnly = substr($clean, 1);
        if (strlen($digitsOnly) >= 10 && strlen($digitsOnly) <= 15) {
            return 'whatsapp:' . $clean;
        }
    }

    // Fallback for general 10-digit numbers
    if (strlen($clean) === 10 && ctype_digit($clean)) {
        return 'whatsapp:+91' . $clean;
    }

    return null;
}

/**
 * Mask phone number for safe logging and client display (e.g., +91 9021***711).
 */
function maskPhoneNumber($phone) {
    if (empty($phone)) return 'Unknown';
    $clean = preg_replace('/[^\d+]/', '', (string)$phone);
    $len = strlen($clean);
    if ($len <= 5) return '***';
    return substr($clean, 0, min(5, $len - 3)) . '***' . substr($clean, -3);
}

/**
 * Safe server-side audit logging for WhatsApp dispatch attempts.
 * Sensitive credentials are NEVER logged.
 */
function logWhatsAppNotification($studentId, $recipient, $success, $status, $sid = null, $errorCode = null, $errorMsg = null) {
    $logDir = __DIR__ . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $logFile = $logDir . DIRECTORY_SEPARATOR . 'whatsapp_notifications.log';

    $entry = [
        'timestamp'   => date('Y-m-d H:i:s'),
        'student_id'  => $studentId,
        'recipient'   => maskPhoneNumber($recipient),
        'success'     => $success ? true : false,
        'status'      => $status,
        'message_sid' => $sid ?: null,
        'error_code'  => $errorCode ?: null,
        'error'       => $errorMsg ?: null
    ];

    @file_put_contents($logFile, json_encode($entry) . PHP_EOL, FILE_APPEND | LOCK_EX);
}

/**
 * Map Twilio error codes to clean, actionable, human-readable explanations.
 */
function explainTwilioError($code, $rawMsg) {
    switch ((int)$code) {
        case 21654:
            return "Twilio WhatsApp Sandbox requires an approved template (ContentSid). Business-initiated custom Body text is not permitted outside an active 24-hour customer window.";
        case 63015:
            return "Recipient WhatsApp number has not joined the Twilio WhatsApp Sandbox (must send join code to the sandbox number).";
        case 63016:
            return "WhatsApp 24-hour customer window is inactive; an approved WhatsApp template (ContentSid) is required.";
        case 572002:
            return "Twilio Trial account restriction: Destination number is not verified in Twilio Console or has not joined the Sandbox.";
        case 21211:
            return "Invalid recipient phone number format.";
        case 21614:
            return "Phone number is not WhatsApp-capable.";
        case 21408:
            return "Twilio account lacks permission to send messages to this region/destination.";
        case 20003:
            return "Twilio authentication failed or trial account limitation.";
        default:
            return !empty($rawMsg) ? $rawMsg : "Twilio error (code $code)";
    }
}

/**
 * Send a WhatsApp notification via Twilio REST API.
 * 
 * Supports both standard message Body and Twilio Content Template (ContentSid + ContentVariables).
 * Captures message SID, API delivery status, and provides rich error handling.
 */
function sendTwilioWhatsAppNotification($toWhatsAppNumber, $messageBody, $contentSid = null, $contentVariables = [], $studentId = null) {
    if (!isTwilioConfigured()) {
        $err = 'Twilio credentials not configured (TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing in .env).';
        if ($studentId) {
            logWhatsAppNotification($studentId, $toWhatsAppNumber, false, 'failed', null, null, $err);
        }
        return [
            'success'    => false,
            'error'      => $err,
            'error_code' => null
        ];
    }

    if (empty($toWhatsAppNumber)) {
        $err = 'No valid WhatsApp phone number provided.';
        if ($studentId) {
            logWhatsAppNotification($studentId, 'None', false, 'failed', null, null, $err);
        }
        return [
            'success'    => false,
            'error'      => $err,
            'error_code' => null
        ];
    }

    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode(TWILIO_ACCOUNT_SID) . '/Messages.json';

    $activeContentSid = !empty($contentSid) ? $contentSid : TWILIO_WHATSAPP_CONTENT_SID;

    $params = [
        'From' => TWILIO_WHATSAPP_FROM,
        'To'   => $toWhatsAppNumber
    ];

    if (!empty($activeContentSid)) {
        $params['ContentSid'] = $activeContentSid;
        if (!empty($contentVariables)) {
            $params['ContentVariables'] = is_string($contentVariables) ? $contentVariables : json_encode($contentVariables);
        }
    } else {
        $params['Body'] = $messageBody;
    }

    $postFields = http_build_query($params);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postFields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD        => TWILIO_ACCOUNT_SID . ':' . TWILIO_AUTH_TOKEN,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json'
        ],
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $curlErr = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlErr) {
        $err = 'Network error connecting to Twilio: ' . $curlErr;
        if ($studentId) {
            logWhatsAppNotification($studentId, $toWhatsAppNumber, false, 'network_error', null, null, $err);
        }
        return [
            'success'    => false,
            'error'      => $err,
            'error_code' => null
        ];
    }

    $data = json_decode($response, true) ?: [];

    // HTTP 200 or 201 indicate that Twilio accepted the message request
    if ($httpCode >= 200 && $httpCode < 300 && !empty($data['sid'])) {
        $msgSid = $data['sid'];
        $msgStatus = $data['status'] ?? 'queued';

        if ($studentId) {
            logWhatsAppNotification($studentId, $toWhatsAppNumber, true, $msgStatus, $msgSid);
        }

        return [
            'success'      => true,
            'message_sid'  => $msgSid,
            'status'       => $msgStatus,
            'api_accepted' => true
        ];
    }

    // Twilio returned an error code
    $errCode = $data['code'] ?? $httpCode;
    $rawMessage = $data['message'] ?? "HTTP error $httpCode";
    $humanExplanation = explainTwilioError($errCode, $rawMessage);

    if ($studentId) {
        logWhatsAppNotification($studentId, $toWhatsAppNumber, false, 'failed', null, $errCode, $humanExplanation);
    }

    return [
        'success'     => false,
        'error'       => $humanExplanation,
        'error_code'  => $errCode,
        'raw_message' => $rawMessage
    ];
}
