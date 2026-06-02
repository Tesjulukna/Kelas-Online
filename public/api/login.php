<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$login = clean_text($payload['username'] ?? '', 120);
$username = clean_username($login);
$email = clean_email($login);
$password = (string) ($payload['password'] ?? '');

if (($username === '' && $email === '') || $password === '') {
    send_json(400, ['message' => 'Username/email dan password wajib diisi.']);
}

$query = $pdo->prepare(
    'SELECT * FROM accounts
    WHERE status = ?
        AND (username = ? OR email = ?)
    ORDER BY FIELD(role, "admin", "member")
    LIMIT 10',
);
$query->execute(['Aktif', $username, $email]);
$account = null;

foreach ($query->fetchAll() as $candidate) {
    if (verify_password_value($password, $candidate['password_hash'])) {
        $account = $candidate;
        break;
    }
}

if (!$account) {
    send_json(401, ['message' => 'Username atau password tidak sesuai.']);
}

$token = '';

try {
    $pdo->exec('DELETE FROM auth_sessions WHERE expires_at < NOW()');
    $token = bin2hex(random_bytes(32));
    $insertSession = $pdo->prepare(
        'INSERT INTO auth_sessions
        (id, account_id, role, token_hash, user_agent, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())',
    );
    $insertSession->execute([
        make_id('session'),
        $account['id'],
        $account['role'],
        hash('sha256', $token),
        clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 255),
    ]);
} catch (Throwable $error) {
    // The installer will create auth_sessions; PHP session still keeps login working.
    $token = '';
}

session_regenerate_id(true);
$_SESSION['user'] = session_payload_from_account($account, $token);

send_json(200, ['session' => $_SESSION['user']]);
