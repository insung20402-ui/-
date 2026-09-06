<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';

// 이 엔드포인트가 받는 필드는 집계값뿐이다: amount(정수), app_category(enum),
// night_screen_minutes(정수), target_app_sessions(정수). 알림 원문이나 계좌 정보를
// 담는 필드는 스키마에도, 이 스크립트에도 존재하지 않는다.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'method_not_allowed'], 405);
}

$body = read_json_body();

$deviceHash = $body['device_hash'] ?? '';
$type = $body['type'] ?? '';

if (!preg_match('/^[a-f0-9]{64}$/', $deviceHash)) {
    json_response(['error' => 'invalid_device_hash'], 400);
}

$db = get_db();

$stmt = $db->prepare('SELECT id, is_active FROM users WHERE device_hash = ? LIMIT 1');
$stmt->bind_param('s', $deviceHash);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) {
    // 등록되지 않은 기기는 조용히 거부한다 — 온보딩(동의) 없이는 데이터가 쌓이지 않는다.
    json_response(['error' => 'device_not_registered'], 403);
}
if ((int)$user['is_active'] !== 1) {
    json_response(['error' => 'monitoring_disabled_by_user'], 403);
}
$userId = (int)$user['id'];

if ($type === 'payment') {
    $appCategory = $body['app_category'] ?? '';
    $amount = filter_var($body['amount'] ?? null, FILTER_VALIDATE_INT);
    $occurredAt = $body['occurred_at'] ?? '';

    if (!in_array($appCategory, ['bank', 'pay'], true) || $amount === false || $amount < 0) {
        json_response(['error' => 'invalid_payment_payload'], 400);
    }

    $stmt = $db->prepare(
        'INSERT INTO payment_events (user_id, app_category, amount, occurred_at) VALUES (?, ?, ?, ?)'
    );
    $stmt->bind_param('isis', $userId, $appCategory, $amount, $occurredAt);
    $stmt->execute();
    $stmt->close();

    json_response(['ok' => true]);
}

if ($type === 'usage') {
    $logDate = $body['log_date'] ?? '';
    $nightMinutes = filter_var($body['night_screen_minutes'] ?? null, FILTER_VALIDATE_INT);
    $targetSessions = filter_var($body['target_app_sessions'] ?? null, FILTER_VALIDATE_INT);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $logDate) || $nightMinutes === false || $targetSessions === false) {
        json_response(['error' => 'invalid_usage_payload'], 400);
    }

    $stmt = $db->prepare(
        'INSERT INTO usage_logs (user_id, log_date, night_screen_minutes, target_app_sessions)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE night_screen_minutes = VALUES(night_screen_minutes),
                                  target_app_sessions = VALUES(target_app_sessions)'
    );
    $stmt->bind_param('isii', $userId, $logDate, $nightMinutes, $targetSessions);
    $stmt->execute();
    $stmt->close();

    json_response(['ok' => true]);
}

json_response(['error' => 'unknown_type'], 400);
