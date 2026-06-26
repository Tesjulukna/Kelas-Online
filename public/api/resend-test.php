<?php

require __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email.php';

ensure_method(['GET', 'POST']);

$user = require_user('admin');
$payload = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? read_json_body() : [];
$to = clean_email($payload['to'] ?? ($_GET['to'] ?? ($user['email'] ?? '')));

if ($to === '') {
    send_json(422, ['message' => 'Email tujuan test Resend tidak valid.']);
}

$config = api_config();
$result = send_resend_email([
    'to' => $to,
    'subject' => 'Test email IbnuCreative',
    'text' => "Halo,\n\nIni adalah test email dari website IbnuCreative.\n\nJika email ini masuk, konfigurasi Resend di hosting sudah berfungsi.\n\nIbnuCreative Academy",
    'html' => '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">'
        . '<h2>Test email IbnuCreative</h2>'
        . '<p>Halo,</p>'
        . '<p>Ini adalah test email dari website IbnuCreative.</p>'
        . '<p>Jika email ini masuk, konfigurasi Resend di hosting sudah berfungsi.</p>'
        . '<p>IbnuCreative Academy</p>'
        . '</div>',
]);

send_json(!empty($result['sent']) ? 200 : 502, [
    'ok' => !empty($result['sent']),
    'to' => $to,
    'fromConfigured' => !empty($config['resend_from_email']),
    'apiKeyConfigured' => !empty($config['resend_api_key']),
    'curlEnabled' => function_exists('curl_init'),
    'result' => $result,
]);
