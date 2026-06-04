<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$login = clean_text($payload['username'] ?? '', 120);
$username = clean_username($login);
$email = clean_email($login);
$password = (string) ($payload['password'] ?? '');

function login_attempt_key(string $login): string
{
    $ip = clean_text($_SERVER['REMOTE_ADDR'] ?? 'unknown', 80);

    return hash('sha256', strtolower($login) . '|' . $ip);
}

function ensure_login_attempts_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS login_attempts (
                attempt_key VARCHAR(64) PRIMARY KEY,
                attempts INT NOT NULL DEFAULT 0,
                last_attempt_at DATETIME NOT NULL,
                blocked_until DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX login_attempt_block_index (blocked_until)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        );
    } catch (Throwable $error) {
        // Login still works if a host blocks runtime schema changes.
    }
}

function assert_login_allowed(PDO $pdo, string $attemptKey): void
{
    try {
        $query = $pdo->prepare('SELECT blocked_until FROM login_attempts WHERE attempt_key = ? LIMIT 1');
        $query->execute([$attemptKey]);
        $row = $query->fetch();

        if (!empty($row['blocked_until']) && strtotime((string) $row['blocked_until']) > time()) {
            send_json(429, ['message' => 'Terlalu banyak percobaan login. Coba lagi beberapa menit.']);
        }
    } catch (Throwable $error) {
        // Best-effort protection.
    }
}

function record_login_failure(PDO $pdo, string $attemptKey): void
{
    try {
        $query = $pdo->prepare('SELECT attempts, last_attempt_at FROM login_attempts WHERE attempt_key = ? LIMIT 1');
        $query->execute([$attemptKey]);
        $row = $query->fetch();
        $recent = $row && strtotime((string) $row['last_attempt_at']) >= time() - (15 * 60);
        $attempts = $recent ? ((int) $row['attempts'] + 1) : 1;
        $blockedUntil = $attempts >= 5
            ? date('Y-m-d H:i:s', time() + (15 * 60))
            : null;
        $upsert = $pdo->prepare(
            'INSERT INTO login_attempts (attempt_key, attempts, last_attempt_at, blocked_until)
            VALUES (?, ?, NOW(), ?)
            ON DUPLICATE KEY UPDATE attempts = VALUES(attempts),
                last_attempt_at = NOW(),
                blocked_until = VALUES(blocked_until)',
        );
        $upsert->execute([$attemptKey, $attempts, $blockedUntil]);
    } catch (Throwable $error) {
        // Best-effort protection.
    }
}

function clear_login_failures(PDO $pdo, string $attemptKey): void
{
    try {
        $delete = $pdo->prepare('DELETE FROM login_attempts WHERE attempt_key = ?');
        $delete->execute([$attemptKey]);
    } catch (Throwable $error) {
        // Best-effort cleanup.
    }
}

if (($username === '' && $email === '') || $password === '') {
    send_json(400, ['message' => 'Username/email dan password wajib diisi.']);
}

ensure_login_attempts_table($pdo);
$attemptKey = login_attempt_key($login);
assert_login_allowed($pdo, $attemptKey);

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
    record_login_failure($pdo, $attemptKey);
    send_json(401, ['message' => 'Username atau password tidak sesuai.']);
}

clear_login_failures($pdo, $attemptKey);
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
