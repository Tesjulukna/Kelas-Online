<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);

function google_callback_fail(string $message): void
{
    $safeMessage = rawurlencode($message);
    header('Location: /login?error=' . $safeMessage);
    exit;
}

function google_http_json(string $url, array $options = []): array
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);

    if (!empty($options['post'])) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($options['post']));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    }

    if (!empty($options['headers'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $options['headers']);
    }

    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $data = json_decode((string) $body, true);

    if ($status < 200 || $status >= 300 || !is_array($data)) {
        google_callback_fail('Login Google gagal diproses.');
    }

    return $data;
}

function google_unique_username(PDO $pdo, string $email, string $name): string
{
    $base = clean_username(strtok($email, '@') ?: $name ?: 'google');
    $base = $base !== '' ? $base : 'google';

    for ($index = 0; $index < 50; $index += 1) {
        $candidate = $index === 0 ? $base : $base . $index;
        $query = $pdo->prepare('SELECT id FROM accounts WHERE role = ? AND username = ? LIMIT 1');
        $query->execute(['member', $candidate]);

        if (!$query->fetch()) {
            return $candidate;
        }
    }

    return 'google' . substr(bin2hex(random_bytes(4)), 0, 8);
}

$code = clean_text($_GET['code'] ?? '', 2000);
$state = clean_text($_GET['state'] ?? '', 120);
$expectedState = clean_text($_SESSION['google_oauth_state'] ?? '', 120);
unset($_SESSION['google_oauth_state']);

if ($code === '' || $state === '' || $expectedState === '' || !hash_equals($expectedState, $state)) {
    google_callback_fail('Sesi login Google tidak valid. Coba login lagi.');
}

$config = api_config();
$clientId = clean_text($config['google_client_id'] ?? '', 240);
$clientSecret = clean_text($config['google_client_secret'] ?? '', 240);
$redirectUrl = clean_asset_url($config['google_redirect_url'] ?? '');

if ($redirectUrl === '') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = clean_text($_SERVER['HTTP_HOST'] ?? '', 180);
    $redirectUrl = $host ? "{$scheme}://{$host}/api/google-callback" : '';
}

if ($clientId === '' || $clientSecret === '' || $redirectUrl === '') {
    google_callback_fail('Konfigurasi Google belum lengkap.');
}

$tokenData = google_http_json('https://oauth2.googleapis.com/token', [
    'post' => [
        'code' => $code,
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'redirect_uri' => $redirectUrl,
        'grant_type' => 'authorization_code',
    ],
]);

$accessToken = clean_text($tokenData['access_token'] ?? '', 2000);

if ($accessToken === '') {
    google_callback_fail('Token Google tidak tersedia.');
}

$profile = google_http_json('https://www.googleapis.com/oauth2/v3/userinfo', [
    'headers' => ['Authorization: Bearer ' . $accessToken],
]);

$email = clean_email($profile['email'] ?? '');
$name = clean_text($profile['name'] ?? $profile['given_name'] ?? '', 120);
$avatar = clean_asset_url($profile['picture'] ?? '');

if ($email === '') {
    google_callback_fail('Email Google tidak bisa dibaca.');
}

$pdo = db();

$query = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
$query->execute(['member', $email]);
$account = $query->fetch();

if ($account) {
    $update = $pdo->prepare(
        "UPDATE accounts SET name = ?, avatar = ?, status = 'Aktif' WHERE id = ? AND role = ?",
    );
    $update->execute([$name ?: $account['name'], $avatar ?: ($account['avatar'] ?? ''), $account['id'], 'member']);
    $query->execute(['member', $email]);
    $account = $query->fetch();
} else {
    $memberId = make_id('member');
    $username = google_unique_username($pdo, $email, $name);
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

if (!$account) {
    google_callback_fail('Akun member tidak bisa dibuat.');
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

session_regenerate_id(true);
$_SESSION['user'] = session_payload_from_account($account, $token);

$sessionJson = json_encode($_SESSION['user'], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
$scriptNonce = base64_encode(random_bytes(16));

header(
    "Content-Security-Policy: default-src 'self'; " .
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " .
    "img-src 'self' data: blob: https:; media-src 'self' blob: data: https:; " .
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " .
    "font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'nonce-{$scriptNonce}'; " .
    "connect-src 'self' https:; frame-src https://www.youtube.com https://youtube.com; " .
    "form-action 'self'; upgrade-insecure-requests",
    true,
);
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=/member"><title>Login Google</title></head><body>';
echo '<script nonce="' . htmlspecialchars($scriptNonce, ENT_QUOTES, 'UTF-8') . '">';
echo 'try{localStorage.setItem("ibnucreative.session.v1",' . json_encode($sessionJson) . ');}catch(e){try{sessionStorage.setItem("ibnucreative.session.v1",' . json_encode($sessionJson) . ');}catch(_){}}';
echo 'window.location.replace("/member");';
echo '</script>';
echo '<p>Login berhasil. Mengalihkan ke dashboard member...</p>';
echo '<p><a href="/member">Klik di sini jika tidak otomatis berpindah.</a></p>';
echo '</body></html>';
