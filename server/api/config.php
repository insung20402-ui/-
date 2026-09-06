<?php
declare(strict_types=1);

// 비밀값은 반드시 환경변수(.env, Apache SetEnv 등)로 주입한다. 저장소에 평문으로 커밋하지 않는다.
function env(string $key, ?string $default = null): ?string {
    $value = getenv($key);
    return $value !== false ? $value : $default;
}

const DB_HOST = 'localhost';
$DB_NAME = env('DONGHAENG_DB_NAME', 'donghaeng');
$DB_USER = env('DONGHAENG_DB_USER', 'donghaeng_app');
$DB_PASS = env('DONGHAENG_DB_PASS', '');

define('DB_NAME', $DB_NAME);
define('DB_USER', $DB_USER);
define('DB_PASS', $DB_PASS);

define('GEMINI_API_KEY', env('GEMINI_API_KEY', ''));
define('GEMINI_MODEL', 'gemini-2.0-flash');

define('SOLAPI_API_KEY', env('SOLAPI_API_KEY', ''));
define('SOLAPI_API_SECRET', env('SOLAPI_API_SECRET', ''));
define('SOLAPI_SENDER_NUMBER', env('SOLAPI_SENDER_NUMBER', ''));

define('RISK_ALERT_THRESHOLD', 70);

function get_db(): mysqli {
    $mysqli = mysqli_init();
    $mysqli->real_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

/** 요청 본문을 JSON으로 읽고 실패 시 400으로 즉시 종료한다. */
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid_json']);
        exit;
    }
    return $data;
}

function json_response(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
