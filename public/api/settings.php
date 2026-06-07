<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'PUT']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    send_json(200, [
        'settings' => fetch_website_settings($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

require_user('admin');

$payload = read_json_body();
$settings = is_array($payload['settings'] ?? null) ? $payload['settings'] : $payload;
$savedSettings = save_website_settings($pdo, $settings);

send_json(200, [
    'settings' => $savedSettings,
    'updatedAt' => updated_at($pdo),
]);
