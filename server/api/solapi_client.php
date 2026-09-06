<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';

/** Solapi(https://solapi.com) 문자 발송 API 최소 래퍼 (HMAC 서명 방식). */
function send_sms(string $toNumber, string $message): bool {
    if (SOLAPI_API_KEY === '' || SOLAPI_API_SECRET === '') {
        error_log('Solapi 키가 설정되지 않았습니다.');
        return false;
    }

    $date = gmdate('Y-m-d\TH:i:s\Z');
    $salt = bin2hex(random_bytes(16));
    $signature = hash_hmac('sha256', $date . $salt, SOLAPI_API_SECRET);

    $payload = [
        'message' => [
            'to' => $toNumber,
            'from' => SOLAPI_SENDER_NUMBER,
            'text' => $message,
        ],
    ];

    $ch = curl_init('https://api.solapi.com/messages/v4/send');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            sprintf(
                'Authorization: HMAC-SHA256 apiKey=%s, date=%s, salt=%s, signature=%s',
                SOLAPI_API_KEY,
                $date,
                $salt,
                $signature
            ),
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 10,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false || $httpCode >= 300) {
        error_log("Solapi 발송 실패 (to: $toNumber): HTTP $httpCode");
        return false;
    }
    return true;
}
