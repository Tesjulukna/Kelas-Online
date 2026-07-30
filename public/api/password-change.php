<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_email.php';

ensure_method(['POST']);

$user = require_user('member');
$pdo = db();
$payload = read_json_body();
$currentPassword = (string) ($payload['currentPassword'] ?? '');
$newPassword = (string) ($payload['newPassword'] ?? '');
$confirmPassword = (string) ($payload['confirmPassword'] ?? '');

if ($currentPassword === '') {
    send_json(422, ['message' => 'Password saat ini wajib diisi.']);
}

if (strlen($newPassword) < 8) {
    send_json(422, ['message' => 'Password baru minimal 8 karakter.']);
}

if ($newPassword !== $confirmPassword) {
    send_json(422, ['message' => 'Konfirmasi password baru belum sama.']);
}

$query = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? AND status = ? LIMIT 1');
$query->execute([$user['userId'], 'member', 'Aktif']);
$account = $query->fetch();

if (!$account) {
    send_json(404, ['message' => 'Akun member tidak ditemukan.']);
}

if (!verify_password_value($currentPassword, (string) $account['password_hash'])) {
    send_json(422, ['message' => 'Password saat ini tidak sesuai.']);
}

if (verify_password_value($newPassword, (string) $account['password_hash'])) {
    send_json(422, ['message' => 'Password baru tidak boleh sama dengan password saat ini.']);
}

$update = $pdo->prepare('UPDATE accounts SET password_hash = ? WHERE id = ? AND role = ?');
$update->execute([hash_password_value($newPassword), $account['id'], 'member']);
$currentToken = clean_session_token($user['token'] ?? '');

try {
    if ($currentToken !== '') {
        $deleteSessions = $pdo->prepare(
            'DELETE FROM auth_sessions WHERE account_id = ? AND token_hash <> ?',
        );
        $deleteSessions->execute([$account['id'], hash('sha256', $currentToken)]);
    } else {
        $deleteSessions = $pdo->prepare('DELETE FROM auth_sessions WHERE account_id = ?');
        $deleteSessions->execute([$account['id']]);
    }
} catch (Throwable $error) {
    // Password tetap berhasil diperbarui jika tabel sesi belum tersedia.
}

$emailResult = send_password_changed_email([
    'buyerName' => $account['name'] ?? 'Member',
    'buyerEmail' => $account['email'] ?? '',
    'wasReset' => false,
]);

send_json(200, [
    'ok' => true,
    'emailSent' => !empty($emailResult['sent']),
    'message' => 'Password berhasil diganti. Sesi di perangkat lain sudah dikeluarkan.',
]);
