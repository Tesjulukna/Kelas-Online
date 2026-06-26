<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);

$config = api_config();
$clientId = clean_text($config['google_client_id'] ?? '', 240);
$clientSecret = clean_text($config['google_client_secret'] ?? '', 240);
$redirectUrl = clean_asset_url($config['google_redirect_url'] ?? '');

if ($clientId === '' || $clientSecret === '') {
    send_json(500, ['message' => 'Google Client ID dan Client Secret belum diisi di config.php.']);
}

if ($redirectUrl === '') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = clean_text($_SERVER['HTTP_HOST'] ?? '', 180);
    $redirectUrl = $host ? "{$scheme}://{$host}/api/google-callback" : '';
}

if ($redirectUrl === '') {
    send_json(500, ['message' => 'Google Redirect URL belum tersedia.']);
}

$state = bin2hex(random_bytes(24));
$_SESSION['google_oauth_state'] = $state;

$params = [
    'client_id' => $clientId,
    'redirect_uri' => $redirectUrl,
    'response_type' => 'code',
    'scope' => 'openid email profile',
    'state' => $state,
    'prompt' => 'select_account',
    'access_type' => 'offline',
];

send_json(200, [
    'url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params),
]);

