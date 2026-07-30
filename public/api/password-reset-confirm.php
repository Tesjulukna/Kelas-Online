<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_password_reset.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$token = clean_text($payload['token'] ?? '', 180);
$newPassword = (string) ($payload['newPassword'] ?? '');
$confirmPassword = (string) ($payload['confirmPassword'] ?? '');

if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
    send_json(422, ['message' => 'Link reset password tidak valid atau sudah kedaluwarsa.']);
}

if (strlen($newPassword) < 8) {
    send_json(422, ['message' => 'Password baru minimal 8 karakter.']);
}

if ($newPassword !== $confirmPassword) {
    send_json(422, ['message' => 'Konfirmasi password baru belum sama.']);
}

password_reset_ensure_schema($pdo);
$tokenHash = hash('sha256', $token);
$pdo->beginTransaction();

try {
    $tokenQuery = $pdo->prepare(
        'SELECT * FROM password_reset_tokens
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
        LIMIT 1 FOR UPDATE',
    );
    $tokenQuery->execute([$tokenHash]);
    $reset = $tokenQuery->fetch();

    if (!$reset) {
        $pdo->rollBack();
        send_json(422, ['message' => 'Link reset password tidak valid, sudah dipakai, atau sudah kedaluwarsa.']);
    }

    $accountQuery = $pdo->prepare(
        'SELECT * FROM accounts WHERE id = ? AND role = ? AND status = ? LIMIT 1 FOR UPDATE',
    );
    $accountQuery->execute([$reset['account_id'], 'member', 'Aktif']);
    $account = $accountQuery->fetch();

    if (!$account) {
        $pdo->rollBack();
        send_json(404, ['message' => 'Akun member tidak ditemukan atau tidak aktif.']);
    }

    if (verify_password_value($newPassword, (string) $account['password_hash'])) {
        $pdo->rollBack();
        send_json(422, ['message' => 'Password baru tidak boleh sama dengan password sebelumnya.']);
    }

    $updateAccount = $pdo->prepare('UPDATE accounts SET password_hash = ? WHERE id = ? AND role = ?');
    $updateAccount->execute([hash_password_value($newPassword), $account['id'], 'member']);
    $useToken = $pdo->prepare(
        'UPDATE password_reset_tokens SET used_at = NOW(), token_hash = NULL WHERE account_id = ?',
    );
    $useToken->execute([$account['id']]);

    try {
        $deleteSessions = $pdo->prepare('DELETE FROM auth_sessions WHERE account_id = ?');
        $deleteSessions->execute([$account['id']]);
    } catch (Throwable $error) {
        // Reset tetap dilanjutkan jika tabel sesi belum tersedia.
    }

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    throw $error;
}

$emailResult = send_password_changed_email([
    'buyerName' => $account['name'] ?? 'Member',
    'buyerEmail' => $account['email'] ?? '',
    'wasReset' => true,
]);

send_json(200, [
    'ok' => true,
    'emailSent' => !empty($emailResult['sent']),
    'loginUrl' => rtrim(clean_external_url(api_config()['site_public_url'] ?? ''), '/') . '/login',
    'message' => 'Password berhasil direset. Silakan login menggunakan password baru.',
]);
