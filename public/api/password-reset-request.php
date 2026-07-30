<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_password_reset.php';

ensure_method(['POST']);

$pdo = db();
$config = api_config();
$payload = read_json_body();
$email = clean_email($payload['email'] ?? '');
$genericMessage = 'Jika email terdaftar, instruksi reset password sudah diproses. Periksa inbox dan folder spam.';

if ($email === '') {
    send_json(422, ['message' => 'Masukkan alamat email yang valid.']);
}

password_reset_ensure_schema($pdo);

try {
    $pdo->exec(
        'DELETE FROM password_reset_rate_limits
        WHERE last_attempt_at < DATE_SUB(NOW(), INTERVAL 2 DAY)
        LIMIT 500',
    );
} catch (Throwable $error) {
    // Pembersihan rate limit lama tidak boleh menghambat permintaan yang valid.
}

password_reset_consume_rate_limit(
    $pdo,
    password_reset_rate_key('ip', password_reset_client_ip()),
    10,
);
password_reset_consume_rate_limit(
    $pdo,
    password_reset_rate_key('email', $email),
    5,
);

$accountQuery = $pdo->prepare(
    'SELECT * FROM accounts WHERE role = ? AND email = ? AND status = ? LIMIT 1',
);
$accountQuery->execute(['member', $email, 'Aktif']);
$account = $accountQuery->fetch();

if (!$account) {
    send_json(200, ['ok' => true, 'message' => $genericMessage]);
}

$pdo->beginTransaction();

try {
    $tokenQuery = $pdo->prepare(
        'SELECT * FROM password_reset_tokens WHERE account_id = ? FOR UPDATE',
    );
    $tokenQuery->execute([$account['id']]);
    $existing = $tokenQuery->fetch();
    $isActive = $existing
        && empty($existing['used_at'])
        && !empty($existing['token_hash'])
        && password_reset_seconds_remaining($existing['expires_at'] ?? '') > 0;

    if ($isActive) {
        $retryAfter = password_reset_seconds_remaining($existing['expires_at']);
        $pdo->commit();
        send_json(200, [
            'ok' => true,
            'alreadyActive' => true,
            'emailSent' => false,
            'retryAfter' => $retryAfter,
            'message' => 'Link reset masih aktif dan tidak dikirim ulang. Periksa inbox atau tunggu sampai link kedaluwarsa.',
        ]);
    }

    $rawToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $rawToken);

    if ($existing) {
        $save = $pdo->prepare(
            'UPDATE password_reset_tokens
            SET token_hash = ?, requested_email = ?, expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE),
                used_at = NULL, email_sent_at = NULL
            WHERE account_id = ?',
        );
        $save->execute([$tokenHash, $email, $account['id']]);
    } else {
        $save = $pdo->prepare(
            'INSERT INTO password_reset_tokens
            (account_id, token_hash, requested_email, expires_at, used_at, email_sent_at)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NULL, NULL)',
        );
        $save->execute([$account['id'], $tokenHash, $email]);
    }

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    // Permintaan bersamaan akan memakai token aktif yang sudah lebih dahulu dibuat.
    $activeQuery = $pdo->prepare(
        'SELECT expires_at FROM password_reset_tokens
        WHERE account_id = ? AND used_at IS NULL AND token_hash IS NOT NULL AND expires_at > NOW()
        LIMIT 1',
    );
    $activeQuery->execute([$account['id']]);
    $active = $activeQuery->fetch();

    if ($active) {
        send_json(200, [
            'ok' => true,
            'alreadyActive' => true,
            'emailSent' => false,
            'retryAfter' => password_reset_seconds_remaining($active['expires_at']),
            'message' => 'Link reset masih aktif dan tidak dikirim ulang. Periksa inbox atau tunggu sampai link kedaluwarsa.',
        ]);
    }

    send_json(500, ['message' => 'Permintaan reset password belum bisa diproses.']);
}

$resetUrl = password_reset_public_url($config, $rawToken);
$emailResult = send_password_reset_link_email([
    'buyerName' => $account['name'] ?? 'Member',
    'buyerEmail' => $email,
    'resetUrl' => $resetUrl,
    'expiresMinutes' => 30,
]);

if (empty($emailResult['sent'])) {
    $cancel = $pdo->prepare(
        'UPDATE password_reset_tokens
        SET token_hash = NULL, expires_at = NOW(), used_at = NOW()
        WHERE account_id = ? AND token_hash = ?',
    );
    $cancel->execute([$account['id'], $tokenHash]);
    send_json(502, ['message' => 'Email reset belum bisa dikirim. Silakan coba lagi beberapa saat.']);
}

$markSent = $pdo->prepare(
    'UPDATE password_reset_tokens SET email_sent_at = NOW() WHERE account_id = ? AND token_hash = ?',
);
$markSent->execute([$account['id'], $tokenHash]);

send_json(200, [
    'ok' => true,
    'emailSent' => true,
    'retryAfter' => 1800,
    'message' => $genericMessage,
]);
