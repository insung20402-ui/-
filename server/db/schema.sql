-- 동행(Donghaeng) 서버 DB 스키마
-- MySQL / MariaDB, utf8mb4
-- 원칙: 알림 원문·계좌정보는 절대 저장하지 않는다. 저장되는 것은 집계값뿐이다.

CREATE DATABASE IF NOT EXISTS donghaeng CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE donghaeng;

-- 사용자(회복 당사자) + 보호자 연락처를 함께 보관.
-- 당사자와 보호자는 동일한 열람 권한을 가지므로 계정을 분리하지 않고
-- 한 레코드에 두 연락처를 동등하게 둔다.
CREATE TABLE users (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_hash     CHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256(Android ID + salt)',
    nickname        VARCHAR(40) NOT NULL,
    user_phone      VARCHAR(20) NOT NULL COMMENT '본인 긴급 알림 수신 번호',
    guardian_phone  VARCHAR(20) NOT NULL COMMENT '보호자 긴급 알림 수신 번호',
    night_start_min SMALLINT UNSIGNED NOT NULL DEFAULT 0   COMMENT '심야 감지 시작(분, 0=00:00)',
    night_end_min   SMALLINT UNSIGNED NOT NULL DEFAULT 360 COMMENT '심야 감지 종료(분, 360=06:00)',
    consent_version VARCHAR(20) NOT NULL COMMENT '동의한 온보딩 약관 버전',
    consented_at    DATETIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active       TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0=본인이 모니터링 해제함'
) ENGINE=InnoDB;

-- 심야 시간대 사용 집계 (앱 사용 "패턴"만, 콘텐츠는 없음)
CREATE TABLE usage_logs (
    id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id                BIGINT UNSIGNED NOT NULL,
    log_date               DATE NOT NULL,
    night_screen_minutes   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    target_app_sessions    SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '지정 메신저/브라우저 심야 실행 횟수',
    created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usage_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_date (user_id, log_date)
) ENGINE=InnoDB;

-- 결제/송금 이벤트: 금액과 앱 카테고리만. 원문 텍스트·계좌·수취인 정보는 컬럼 자체가 없음.
CREATE TABLE payment_events (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    app_category  ENUM('bank', 'pay', 'other') NOT NULL,
    amount        INT UNSIGNED NOT NULL,
    occurred_at   DATETIME NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_time (user_id, occurred_at)
) ENGINE=InnoDB;

-- AI 위험도 분석 결과 이력 (본인·보호자 동일하게 열람)
CREATE TABLE risk_scores (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    score         TINYINT UNSIGNED NOT NULL COMMENT '1-100',
    summary       VARCHAR(500) NOT NULL COMMENT 'AI가 생성한 근거 요약(3줄 이내)',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_risk_scores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 주간 긍정 리포트
CREATE TABLE weekly_reports (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    week_start    DATE NOT NULL,
    week_end      DATE NOT NULL,
    report_text   TEXT NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_weekly_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_week (user_id, week_start)
) ENGINE=InnoDB;

-- 긴급 통지 발송 이력 (본인/보호자 동시 발송 원칙을 감사 가능하도록 기록)
CREATE TABLE notifications_sent (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    risk_score_id BIGINT UNSIGNED NULL,
    channel     ENUM('sms_user', 'sms_guardian', 'push_user', 'push_guardian') NOT NULL,
    message     VARCHAR(300) NOT NULL,
    sent_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_risk FOREIGN KEY (risk_score_id) REFERENCES risk_scores(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 익명 연대 게시판. 글쓴이는 device_hash로만 식별되며 원문 재추적이 불가능하다.
CREATE TABLE board_posts (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    author_hash      CHAR(64) NOT NULL COMMENT 'SHA-256(Android ID + salt), users.device_hash와 동일 값',
    content          TEXT NOT NULL,
    status           ENUM('approved', 'rejected') NOT NULL DEFAULT 'approved',
    rejection_reason VARCHAR(200) NULL COMMENT 'AI 클린봇이 거부한 사유(도박 조장 등)',
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_author (author_hash),
    INDEX idx_status_time (status, created_at)
) ENGINE=InnoDB;
