<?php
/**
 * VAVA Sports Academy - Meta WhatsApp Cloud API Service
 * 
 * Supports WhatsApp Business App Coexistence route and standalone Cloud API.
 * Securely loads credentials from environment or config.php.
 * All credentials, tokens, and personal data are strictly redacted from logs.
 * Zero external dependencies (native PHP cURL).
 */

require_once __DIR__ . '/config.php';

/**
 * Normalizes phone numbers into Meta WhatsApp Cloud API international format (digits only, e.g. 919876543210).
 * Rejects malformed numbers. Accurately handles Indian phone numbers (10 digits, +91, trunk 0, 91 prefix).
 */
function formatMetaWhatsAppNumber($phone) {
    if (empty($phone)) return null;

    $clean = preg_replace('/[^\d+]/', '', trim((string)$phone));
    if (empty($clean)) return null;

    // Remove leading international 00
    if (strpos($clean, '00') === 0) {
        $clean = substr($clean, 2);
    }

    // Strip leading +
    if (strpos($clean, '+') === 0) {
        $clean = substr($clean, 1);
    }

    // Indian trunk 0 (e.g. 09876543210 -> 919876543210)
    if (preg_match('/^0([6-9]\d{9})$/', $clean, $matches)) {
        return '91' . $matches[1];
    }

    // Standard Indian 10 digits starting with 6, 7, 8, 9
    if (preg_match('/^[6-9]\d{9}$/', $clean)) {
        return '91' . $clean;
    }

    // Indian number with 91 prefix
    if (preg_match('/^91([6-9]\d{9})$/', $clean, $matches)) {
        return '91' . $matches[1];
    }

    // General international numbers (10 to 15 digits)
    if (strlen($clean) >= 10 && strlen($clean) <= 15 && ctype_digit($clean)) {
        return $clean;
    }

    return null;
}

/**
 * Masks phone numbers for safe diagnostics and logs (e.g., +91 9021***711).
 */
function maskMetaPhoneNumber($phone) {
    if (empty($phone)) return 'Unknown';
    $clean = preg_replace('/[^\d+]/', '', (string)$phone);
    $len = strlen($clean);
    if ($len <= 5) return '***';
    return substr($clean, 0, min(5, $len - 3)) . '***' . substr($clean, -3);
}

/**
 * Maps Meta WhatsApp Graph API error codes to human-readable explanations.
 */
function explainMetaWhatsAppError($code, $rawMsg) {
    switch ((int)$code) {
        case 131047:
            return "24-hour customer window inactive; an approved Meta message template is required.";
        case 131026:
            return "Message undeliverable. Recipient phone number may not be registered on WhatsApp.";
        case 132000:
            return "Template does not exist in Meta WhatsApp Manager or language code mismatch.";
        case 132001:
            return "Template parameter count or structure does not match the approved Meta template.";
        case 132015:
            return "Template is paused or rejected due to low quality rating in Meta WhatsApp Manager.";
        case 130429:
        case 80007:
            return "Meta WhatsApp Cloud API rate limit exceeded. Sending throttled.";
        case 190:
            return "Meta Access Token is invalid or expired. Check META_WA_ACCESS_TOKEN in server configuration.";
        case 100:
            return "Invalid request parameter sent to Meta Graph API.";
        default:
            return !empty($rawMsg) ? $rawMsg : "Meta Graph API error (code $code)";
    }
}

/**
 * Safe server-side audit logging for Meta WhatsApp dispatch attempts.
 * Sensitive tokens are NEVER logged.
 */
function logMetaWhatsAppNotification($studentId, $recipient, $success, $status, $msgId = null, $errorCode = null, $errorMsg = null) {
    $logDir = __DIR__ . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $logFile = $logDir . DIRECTORY_SEPARATOR . 'whatsapp_notifications.log';

    $entry = [
        'timestamp'   => date('Y-m-d H:i:s'),
        'provider'    => 'meta_cloud_api',
        'student_id'  => $studentId,
        'recipient'   => maskMetaPhoneNumber($recipient),
        'success'     => $success ? true : false,
        'status'      => $status,
        'message_id'  => $msgId ?: null,
        'error_code'  => $errorCode ?: null,
        'error'       => $errorMsg ?: null
    ];

    @file_put_contents($logFile, json_encode($entry) . PHP_EOL, FILE_APPEND | LOCK_EX);
}

/**
 * Sends a WhatsApp fee reminder notification via Meta WhatsApp Cloud API.
 * 
 * Supports approved templates, test mode, and Coexistence configurations.
 * 
 * @param string $toPhoneNumber Recipient phone number.
 * @param string|null $templateName Meta template name (defaults to env META_WA_TEMPLATE_NAME).
 * @param string|null $langCode Template language code (defaults to env META_WA_TEMPLATE_LANG e.g. 'en_US').
 * @param array $parameters Array of text parameter strings for template variables {{1}}, {{2}}, etc.
 * @param int|null $studentId Associated student ID for audit logging.
 * @param int|null $feeId Associated fee record ID.
 * @return array Structured result containing success status, message_id, and diagnostics.
 */
function sendMetaWhatsAppTemplate($toPhoneNumber, $templateName = null, $langCode = null, $parameters = [], $studentId = null, $feeId = null) {
    $config = getMetaWhatsAppConfig();

    $formattedNumber = formatMetaWhatsAppNumber($toPhoneNumber);
    if (empty($formattedNumber)) {
        $err = 'Invalid or malformed recipient phone number format.';
        if ($studentId) {
            logMetaWhatsAppNotification($studentId, $toPhoneNumber, false, 'failed', null, 'INVALID_NUMBER', $err);
        }
        return [
            'success'      => false,
            'status'       => 'failed',
            'error_code'   => 'INVALID_NUMBER',
            'error'        => $err,
            'api_accepted' => false
        ];
    }

    $activeTemplate = !empty($templateName) ? $templateName : $config['template_name'];
    $activeLang = !empty($langCode) ? $langCode : $config['template_lang'];

    // ── Safe Test Mode / Disabled Handling ───────────────────────────────────
    // If Meta messaging is disabled or running in test mode, simulate provider acceptance safely.
    if (!$config['enabled'] || $config['test_mode'] || empty($config['access_token']) || empty($config['phone_number_id'])) {
        $mockWamid = 'mock_wamid_' . uniqid() . bin2hex(random_bytes(4));
        $reason = !$config['enabled'] 
            ? 'META_WA_ENABLED=false (Live sending disabled in configuration)'
            : ($config['test_mode'] ? 'META_WA_TEST_MODE=true (Safe simulation mode)' : 'Missing credentials in configuration');

        if ($studentId) {
            logMetaWhatsAppNotification($studentId, $formattedNumber, true, 'mock_accepted', $mockWamid, null, $reason);
        }

        return [
            'success'      => true,
            'message_id'   => $mockWamid,
            'status'       => 'accepted',
            'test_mode'    => true,
            'api_accepted' => true,
            'diagnostic'   => $reason
        ];
    }

    // ── Build Meta Graph API Template Request ────────────────────────────────
    $url = "https://graph.facebook.com/{$config['api_version']}/{$config['phone_number_id']}/messages";

    // Format body parameters array according to Meta Graph API specifications
    $bodyParams = [];
    foreach ($parameters as $paramVal) {
        $bodyParams[] = [
            'type' => 'text',
            'text' => (string)$paramVal
        ];
    }

    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type'    => 'individual',
        'to'                => $formattedNumber,
        'type'              => 'template',
        'template'          => [
            'name'     => $activeTemplate,
            'language' => [
                'code' => $activeLang
            ]
        ]
    ];

    if (!empty($bodyParams)) {
        $payload['template']['components'] = [
            [
                'type'       => 'body',
                'parameters' => $bodyParams
            ]
        ];
    }

    $jsonPayload = json_encode($payload);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $jsonPayload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $config['access_token'],
            'Content-Type: application/json',
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
        $err = 'Network connection error to Meta Graph API: ' . $curlErr;
        if ($studentId) {
            logMetaWhatsAppNotification($studentId, $formattedNumber, false, 'network_error', null, 'CURL_ERROR', $err);
        }
        return [
            'success'      => false,
            'status'       => 'network_error',
            'error_code'   => 'CURL_ERROR',
            'error'        => $err,
            'api_accepted' => false
        ];
    }

    $data = json_decode($response, true) ?: [];

    // HTTP 200 or 201 indicates Meta accepted the message request
    if ($httpCode >= 200 && $httpCode < 300 && !empty($data['messages'][0]['id'])) {
        $messageId = $data['messages'][0]['id'];
        $messageStatus = $data['messages'][0]['message_status'] ?? 'accepted';

        if ($studentId) {
            logMetaWhatsAppNotification($studentId, $formattedNumber, true, $messageStatus, $messageId);
        }

        return [
            'success'      => true,
            'message_id'   => $messageId,
            'status'       => $messageStatus,
            'test_mode'    => false,
            'api_accepted' => true
        ];
    }

    // Meta API returned an error
    $errObj = $data['error'] ?? [];
    $errCode = $errObj['code'] ?? $httpCode;
    $rawMsg = $errObj['message'] ?? "Meta API HTTP error $httpCode";
    $humanExplanation = explainMetaWhatsAppError($errCode, $rawMsg);

    if ($studentId) {
        logMetaWhatsAppNotification($studentId, $formattedNumber, false, 'failed', null, $errCode, $humanExplanation);
    }

    return [
        'success'      => false,
        'status'       => 'failed',
        'error_code'   => (string)$errCode,
        'error'        => $humanExplanation,
        'raw_error'    => $rawMsg,
        'api_accepted' => false
    ];
}
