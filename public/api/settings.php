<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'PUT']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function settings_with_public_gateway_config(array $settings): array
{
    $config = api_config();
    $paypalAvailable =
        paypal_configured_value($config['paypal_client_id'] ?? '')
        && paypal_configured_value($config['paypal_client_secret'] ?? '')
        && paypal_configured_value($config['paypal_webhook_id'] ?? '')
        && (float) ($config['paypal_idr_per_usd'] ?? 0) > 0;

    foreach (($settings['paymentMethods'] ?? []) as $index => $paymentMethod) {
        if (($paymentMethod['code'] ?? '') !== 'PAYPAL') {
            continue;
        }

        $settings['paymentMethods'][$index]['provider'] = 'paypal';
        $settings['paymentMethods'][$index]['available'] = $paypalAvailable;
        $settings['paymentMethods'][$index]['currency'] = 'USD';
        $settings['paymentMethods'][$index]['exchangeRate'] = max(
            0,
            (float) ($config['paypal_idr_per_usd'] ?? 0),
        );
    }

    return $settings;
}

function paypal_configured_value($value): bool
{
    return trim((string) $value) !== '';
}

if ($method === 'GET') {
    send_json(200, [
        'settings' => settings_with_public_gateway_config(fetch_website_settings($pdo)),
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
    'settings' => settings_with_public_gateway_config($savedSettings),
    'updatedAt' => updated_at($pdo),
]);
