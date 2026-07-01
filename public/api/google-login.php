<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

function google_login_http_json(string $url, array $headers): array
{
    if (!function_exists('curl_init')) {
        send_json(500, ['message' => 'Ekstensi cURL PHP belum aktif.']);
    }

    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $data = json_decode((string) $body, true);

    if ($body === false || $status < 200 || $status >= 300 || !is_array($data)) {
        send_json(401, ['message' => 'Login Google tidak valid.']);
    }

    return $data;
}

function google_login_unique_username(PDO $pdo, string $email, string $name): string
{
    $base = clean_username(strtok($email, '@') ?: $name ?: 'google') ?: 'google';
    $query = $pdo->prepare('SELECT id FROM accounts WHERE role = ? AND username = ? LIMIT 1');

    for ($index = 0; $index < 50; $index += 1) {
        $candidate = $index === 0 ? $base : $base . $index;
        $query->execute(['member', $candidate]);

        if (!$query->fetch()) {
            return $candidate;
        }
    }

    return 'google' . substr(bin2hex(random_bytes(4)), 0, 8);
}

$payload = read_json_body();
$accessToken = clean_text($payload['accessToken'] ?? ($payload['access_token'] ?? ''), 2400);

if ($accessToken === '') {
    send_json(400, ['message' => 'Token Google belum diterima.']);
}

$profile = google_login_http_json('https://www.googleapis.com/oauth2/v3/userinfo', [
    'Authorization: Bearer ' . $accessToken,
    'Accept: application/json',
    'User-Agent: ibnucreative-domainesia-google-login',
]);
$email = clean_email($profile['email'] ?? '');
$name = clean_text($profile['name'] ?? $profile['given_name'] ?? '', 120);
$avatar = clean_asset_url($profile['picture'] ?? '');

if ($email === '') {
    send_json(422, ['message' => 'Email Google tidak ditemukan.']);
}

$pdo = db();
$query = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
$query->execute(['member', $email]);
$account = $query->fetch();

if ($account) {
    $update = $pdo->prepare("UPDATE accounts SET name = ?, avatar = ?, status = 'Aktif' WHERE id = ? AND role = ?");
    $update->execute([$name ?: $account['name'], $avatar ?: ($account['avatar'] ?? ''), $account['id'], 'member']);
    $query->execute(['member', $email]);
    $account = $query->fetch();
} else {
    $memberId = make_id('member');
    $username = google_login_unique_username($pdo, $email, $name);
    $insert = $pdo->prepare(
        'INSERT INTO accounts
        (id, role, name, username, email, phone, status, avatar, allowed_class_ids, password_hash, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insert->execute([
        $memberId,
        'member',
        $name ?: $username,
        $username,
        $email,
        '',
        'Aktif',
        $avatar,
        json_encode([], JSON_UNESCAPED_UNICODE),
        hash_password_value(bin2hex(random_bytes(16))),
        date('Y-m-d'),
    ]);
    $query = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
    $query->execute([$memberId, 'member']);
    $account = $query->fetch();
}

$token = bin2hex(random_bytes(32));
$pdo->exec('DELETE FROM auth_sessions WHERE expires_at < NOW()');
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

$_SESSION['user'] = session_payload_from_account($account, $token);
send_json(200, ['session' => $_SESSION['user']]);
