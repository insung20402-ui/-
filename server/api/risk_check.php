<?php
declare(strict_types=1);
// 크론 전용 스크립트. 웹 노출 금지 — Apache 설정에서 /api/cron/ 하위로 옮기고 외부 접근을 차단할 것.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/gemini_client.php';
require_once __DIR__ . '/solapi_client.php';

$db = get_db();

$users = $db->query('SELECT id, nickname, user_phone, guardian_phone FROM users WHERE is_active = 1');

while ($user = $users->fetch_assoc()) {
    check_user_risk($db, $user);
}

function check_user_risk(mysqli $db, array $user): void {
    $userId = (int)$user['id'];

    $current = fetch_period_stats($db, $userId, 7);
    $baseline = fetch_period_stats($db, $userId, 14, 7); // 직전 14일 중 최근 7일을 제외한 이전 구간

    // 비교할 데이터 자체가 없으면(신규 사용자 등) AI 호출 없이 건너뛴다.
    if ($current['payment_count'] === 0 && $current['night_minutes_avg'] === 0.0) {
        return;
    }

    $prompt = build_risk_prompt($current, $baseline);
    $result = call_gemini($prompt, 0.2);
    if ($result === null) return;

    $parsed = json_decode(extract_json($result), true);
    if (!is_array($parsed) || !isset($parsed['score'], $parsed['summary'])) {
        error_log("위험도 분석 결과 파싱 실패 (user_id: $userId): $result");
        return;
    }

    $score = max(1, min(100, (int)$parsed['score']));
    $summary = mb_substr((string)$parsed['summary'], 0, 500);

    $stmt = $db->prepare(
        'INSERT INTO risk_scores (user_id, period_start, period_end, score, summary) VALUES (?, CURDATE() - INTERVAL 7 DAY, CURDATE(), ?, ?)'
    );
    $stmt->bind_param('iis', $userId, $score, $summary);
    $stmt->execute();
    $riskScoreId = $stmt->insert_id;
    $stmt->close();

    if ($score >= RISK_ALERT_THRESHOLD) {
        notify_both_equally($db, $user, $riskScoreId, $score, $summary);
    }
}

function fetch_period_stats(mysqli $db, int $userId, int $daysAgoStart, int $daysAgoEnd = 0): array {
    $stmt = $db->prepare(
        'SELECT COALESCE(AVG(night_screen_minutes), 0) AS night_minutes_avg,
                COALESCE(SUM(target_app_sessions), 0) AS target_sessions_total
         FROM usage_logs
         WHERE user_id = ? AND log_date BETWEEN CURDATE() - INTERVAL ? DAY AND CURDATE() - INTERVAL ? DAY'
    );
    $stmt->bind_param('iii', $userId, $daysAgoStart, $daysAgoEnd);
    $stmt->execute();
    $usage = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $stmt = $db->prepare(
        'SELECT COUNT(*) AS payment_count, COALESCE(AVG(amount), 0) AS payment_amount_avg
         FROM payment_events
         WHERE user_id = ? AND occurred_at BETWEEN NOW() - INTERVAL ? DAY AND NOW() - INTERVAL ? DAY'
    );
    $stmt->bind_param('iii', $userId, $daysAgoStart, $daysAgoEnd);
    $stmt->execute();
    $payment = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return [
        'night_minutes_avg' => (float)$usage['night_minutes_avg'],
        'target_sessions_total' => (int)$usage['target_sessions_total'],
        'payment_count' => (int)$payment['payment_count'],
        'payment_amount_avg' => (float)$payment['payment_amount_avg'],
    ];
}

function build_risk_prompt(array $current, array $baseline): string {
    $currentJson = json_encode($current, JSON_UNESCAPED_UNICODE);
    $baselineJson = json_encode($baseline, JSON_UNESCAPED_UNICODE);

    return <<<PROMPT
아래는 도박 회복 당사자의 최근 7일 행동 집계 지표와, 그 이전 7일(기준선) 지표다.
개인 식별 정보는 전혀 포함되어 있지 않다.

최근 7일: {$currentJson}
기준선(직전 7일): {$baselineJson}

기준선 대비 심야 사용 시간, 지정 앱 실행 횟수, 결제 이벤트 빈도·금액의 증가 폭을 바탕으로
도박 재발 위험도를 1~100 사이 정수로 평가하고, 근거를 3줄 이내로 요약하라.
다른 설명 없이 아래 JSON 형식으로만 답하라:
{"score": <정수>, "summary": "<3줄 이내 근거>"}
PROMPT;
}

/** Gemini 응답에 설명 텍스트가 섞여 와도 JSON 블록만 뽑아낸다. */
function extract_json(string $text): string {
    if (preg_match('/\{.*\}/s', $text, $m)) {
        return $m[0];
    }
    return $text;
}

/** 임계치 초과 시 본인과 보호자에게 완전히 동일한 문구를 동시에 보낸다 — 일방적 통지 금지. */
function notify_both_equally(mysqli $db, array $user, int $riskScoreId, int $score, string $summary): void {
    $message = "[동행] {$user['nickname']}님의 최근 위험도 점수는 {$score}점이에요. {$summary}";

    $targets = [
        ['channel' => 'sms_user', 'phone' => $user['user_phone']],
        ['channel' => 'sms_guardian', 'phone' => $user['guardian_phone']],
    ];

    foreach ($targets as $target) {
        $sent = send_sms($target['phone'], $message);
        if ($sent) {
            $stmt = $db->prepare(
                'INSERT INTO notifications_sent (user_id, risk_score_id, channel, message) VALUES (?, ?, ?, ?)'
            );
            $userId = (int)$user['id'];
            $stmt->bind_param('iiss', $userId, $riskScoreId, $target['channel'], $message);
            $stmt->execute();
            $stmt->close();
        }
    }
}
