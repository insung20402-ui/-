<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/gemini_client.php';

// 익명 연대 게시판 글쓰기 API.
// 작성자 식별자는 device_hash(이미 앱에서 SHA-256으로 해시된 값)만 받는다 —
// Android ID 원본은 이 서버에 한 번도 도달하지 않으므로 서버 침해 시에도 역추적이 불가능하다.
// 저장 전 Gemini API로 "도박 조장 콘텐츠 여부"를 판별하는 클린봇 필터를 거친다.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'method_not_allowed'], 405);
}

$body = read_json_body();

$authorHash = $body['device_hash'] ?? '';
$content = trim((string)($body['content'] ?? ''));

if (!preg_match('/^[a-f0-9]{64}$/', $authorHash)) {
    json_response(['error' => 'invalid_device_hash'], 400);
}
if ($content === '' || mb_strlen($content) > 1000) {
    json_response(['error' => 'invalid_content_length'], 400);
}

$moderation = moderate_post_content($content);

$db = get_db();
$stmt = $db->prepare(
    'INSERT INTO board_posts (author_hash, content, status, rejection_reason) VALUES (?, ?, ?, ?)'
);
$stmt->bind_param('ssss', $authorHash, $content, $moderation['status'], $moderation['reason']);
$stmt->execute();
$postId = $stmt->insert_id;
$stmt->close();

if ($moderation['status'] === 'rejected') {
    json_response([
        'ok' => false,
        'status' => 'rejected',
        'reason' => $moderation['reason'],
    ], 422);
}

json_response([
    'ok' => true,
    'status' => 'approved',
    'post_id' => $postId,
]);

/**
 * @return array{status: 'approved'|'rejected', reason: ?string}
 */
function moderate_post_content(string $content): array {
    $prompt = <<<PROMPT
다음은 도박 회복 커뮤니티 익명 게시판에 올라온 글입니다.
이 글이 아래 중 하나에 해당하면 "REJECT: <한 문장 사유>" 형식으로만 답하고,
해당하지 않으면 "OK"라고만 답하세요.

- 특정 도박·베팅 사이트, 앱, 연락처를 광고하거나 유도하는 내용
- 도박 재개를 부추기거나 노하우를 공유하는 내용
- 불법 대출, 불법 환전 등 2차 피해를 유도하는 내용

글:
"""
{$content}
"""
PROMPT;

    $result = call_gemini($prompt, 0.0);

    if ($result === null) {
        // AI 호출이 실패하면 안전하게 보수적으로 처리한다: 자동 승인하지 않고 사람이 검토하도록 보류.
        return ['status' => 'rejected', 'reason' => '자동 검수 실패로 관리자 확인이 필요합니다.'];
    }

    $result = trim($result);
    if (str_starts_with($result, 'OK')) {
        return ['status' => 'approved', 'reason' => null];
    }

    if (str_starts_with($result, 'REJECT')) {
        $reason = trim(str_replace('REJECT:', '', $result));
        return ['status' => 'rejected', 'reason' => $reason !== '' ? $reason : '커뮤니티 가이드라인 위반'];
    }

    return ['status' => 'rejected', 'reason' => '자동 검수 결과를 해석할 수 없어 보류되었습니다.'];
}
