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

try {
    $savedSettings = save_website_settings($pdo, $settings);
} catch (Throwable $error) {
    $message = 'Pengaturan website tidak bisa disimpan.';
    $errorText = strtolower($error->getMessage());

    if ((string) $error->getCode() === '42S02' || strpos($errorText, 'site_settings') !== false) {
        $message = 'Tabel site_settings belum siap. Jalankan /api/install.php atau import public/api/schema.sql, lalu coba simpan lagi.';
    }

    send_json(500, ['message' => $message]);
}

send_json(200, [
    'settings' => $savedSettings,
    'updatedAt' => updated_at($pdo),
]);
