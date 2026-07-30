<?php

declare(strict_types=1);

function password_reset_ensure_schema(PDO $pdo): void
{
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS password_reset_tokens (
                account_id VARCHAR(120) PRIMARY KEY,
                token_hash CHAR(64) NULL DEFAULT NULL,
                requested_email VARCHAR(180) NOT NULL DEFAULT '',
                expires_at DATETIME NULL,
                used_at DATETIME NULL,
                email_sent_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY password_reset_token_unique (token_hash),
                INDEX password_reset_expiry_index (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS password_reset_rate_limits (
                rate_key CHAR(64) PRIMARY KEY,
                attempts INT NOT NULL DEFAULT 0,
                window_started_at DATETIME NOT NULL,
                last_attempt_at DATETIME NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        );
    } catch (Throwable $error) {
        $pdo->query('SELECT account_id FROM password_reset_tokens LIMIT 1');
        $pdo->query('SELECT rate_key FROM password_reset_rate_limits LIMIT 1');
    }
}

function password_reset_client_ip(): string
{
    return clean_text($_SERVER['REMOTE_ADDR'] ?? 'unknown', 100) ?: 'unknown';
}

function password_reset_rate_key(string $scope, string $value): string
{
    return hash('sha256', $scope . ':' . strtolower(trim($value)));
}

function password_reset_consume_rate_limit(PDO $pdo, string $key, int $maximum): void
{
    $query = $pdo->prepare(
        'INSERT INTO password_reset_rate_limits
        (rate_key, attempts, window_started_at, last_attempt_at)
        VALUES (?, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            attempts = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, attempts + 1),
            window_started_at = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), window_started_at),
            last_attempt_at = NOW()',
    );
    $query->execute([$key]);
    $check = $pdo->prepare(
        'SELECT attempts, window_started_at FROM password_reset_rate_limits WHERE rate_key = ? LIMIT 1',
    );
    $check->execute([$key]);
    $rate = $check->fetch() ?: [];

    if ((int) ($rate['attempts'] ?? 0) > $maximum) {
        send_json(429, [
            'message' => 'Terlalu banyak permintaan reset. Silakan coba lagi dalam satu jam.',
            'retryAfter' => 3600,
        ]);
    }
}

function password_reset_public_url(array $config, string $token): string
{
    $siteUrl = rtrim(clean_external_url($config['site_public_url'] ?? ''), '/');

    if ($siteUrl === '') {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = clean_text($_SERVER['HTTP_HOST'] ?? '', 180);
        $siteUrl = $host !== '' ? $scheme . '://' . $host : '';
    }

    return $siteUrl !== ''
        ? $siteUrl . '/reset-password?token=' . rawurlencode($token)
        : '';
}

function password_reset_seconds_remaining($expiresAt): int
{
    $expiry = strtotime((string) $expiresAt);

    return $expiry ? max(0, $expiry - time()) : 0;
}
