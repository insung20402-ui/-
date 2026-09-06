<?php
declare(strict_types=1);
// 크론 전용 스크립트 (예: 매주 일요일 21:00). 웹 노출 금지.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/gemini_client.php';

$db = get_db();
$users = $db->query('SELECT id, nickname FROM users WHERE is_active = 1');

while ($user = $users->fetch_assoc()) {
    generate_weekly_report($db, $user);
}

function generate_weekly_report(mysqli $db, array $user): void {
    $userId = (int)$user['id'];

    $stmt = $db->prepare(
        'SELECT COALESCE(AVG(night_screen_minutes), 0) AS night_minutes_avg,
                COALESCE(SUM(target_app_sessions), 0) AS target_sessions_total
         FROM usage_logs WHERE user_id = ? AND log_date >= CURDATE() - INTERVAL 7 DAY'
    );
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $usage = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $stmt = $db->prepare(
        'SELECT COUNT(*) AS payment_count FROM payment_events
         WHERE user_id = ? AND occurred_at >= NOW() - INTERVAL 7 DAY'
    );
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $payment = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $stmt = $db->prepare(
        'SELECT score FROM risk_scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 2'
    );
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $scores = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $stats = [
        'night_minutes_avg' => (float)$usage['night_minutes_avg'],
        'target_sessions_total' => (int)$usage['target_sessions_total'],
        'payment_count' => (int)$payment['payment_count'],
        'latest_risk_score' => $scores[0]['score'] ?? null,
        'previous_risk_score' => $scores[1]['score'] ?? null,
    ];

    $prompt = build_report_prompt($user['nickname'], $stats);
    $reportText = call_gemini($prompt, 0.5);
    if ($reportText === null) return;

    $stmt = $db->prepare(
        'INSERT INTO weekly_reports (user_id, week_start, week_end, report_text)
         VALUES (?, CURDATE() - INTERVAL 7 DAY, CURDATE(), ?)
         ON DUPLICATE KEY UPDATE report_text = VALUES(report_text)'
    );
    $stmt->bind_param('is', $userId, $reportText);
    $stmt->execute();
    $stmt->close();
}

function build_report_prompt(string $nickname, array $stats): string {
    $statsJson = json_encode($stats, JSON_UNESCAPED_UNICODE);

    return <<<PROMPT
당신은 도박 회복을 돕는 다정한 동행자입니다. 아래는 "{$nickname}"님의 이번 주 행동 집계 지표입니다.
{$statsJson}

이 지표를 바탕으로, 질책이나 평가가 아니라 격려의 시선으로 이번 주의 긍정적인 변화를
5~7문장의 리포트로 작성하세요. 점수가 나빠졌더라도 비난하지 말고, 다음 주에 시도해볼 만한
작은 행동 하나를 제안하며 마무리하세요.
PROMPT;
}
