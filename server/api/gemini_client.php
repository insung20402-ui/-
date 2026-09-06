<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';

/**
 * Gemini API 최소 래퍼. 호출부는 항상 "집계 지표"나 "게시글 텍스트"만 넘기며,
 * 이 함수 자체는 어떤 데이터를 프롬프트에 담을지 강제하지 않으므로
 * 호출부가 계좌번호 등 민감정보를 절대 포함하지 않도록 책임진다.
 */
function call_gemini(string $prompt, float $temperature = 0.3): ?string {
    if (GEMINI_API_KEY === '') {
        error_log('GEMINI_API_KEY가 설정되지 않았습니다.');
        return null;
    }

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . GEMINI_MODEL . ':generateContent?key=' . urlencode(GEMINI_API_KEY);

    $payload = [
        'contents' => [[
            'parts' => [['text' => $prompt]]
        ]],
        'generationConfig' => [
            'temperature' => $temperature,
        ],
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 15,
    ]);

    $responseBody = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($responseBody === false || $httpCode !== 200) {
        error_log("Gemini API 호출 실패: HTTP $httpCode");
        return null;
    }

    $decoded = json_decode($responseBody, true);
    return $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
}
