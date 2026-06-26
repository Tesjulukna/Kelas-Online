<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);

$checks = [
    'php' => [
        'ok' => true,
        'version' => PHP_VERSION,
    ],
    'curl' => [
        'ok' => function_exists('curl_init'),
    ],
    'database' => [
        'ok' => false,
    ],
    'uploads' => [
        'ok' => false,
    ],
];

try {
    $pdo = db();
    $checks['database'] = [
        'ok' => true,
        'driver' => $pdo->getAttribute(PDO::ATTR_DRIVER_NAME),
    ];
} catch (Throwable $error) {
    $checks['database']['message'] = 'Database belum tersambung.';
}

$uploadRoot = dirname(__DIR__) . '/uploads';

if (!is_dir($uploadRoot)) {
    @mkdir($uploadRoot, 0755, true);
}

$checks['uploads'] = [
    'ok' => is_dir($uploadRoot) && is_writable($uploadRoot),
    'path' => str_replace('\\', '/', $uploadRoot),
];

$config = api_config();
$checks['google'] = [
    'ok' => !empty($config['google_client_id']) && !empty($config['google_client_secret']),
];
$checks['tripay'] = [
    'ok' => !empty($config['tripay_merchant_code']) && !empty($config['tripay_api_key']) && !empty($config['tripay_private_key']),
];
$checks['lynk'] = [
    'ok' => !empty($config['lynk_webhook_secret']),
    'webhookUrl' => '/api/lynk-webhook.php?secret=***',
    'extensionlessUrlSupported' => true,
];
$checks['resend'] = [
    'ok' => !empty($config['resend_api_key']) && !empty($config['resend_from_email']) && function_exists('curl_init'),
    'configured' => !empty($config['resend_api_key']) && !empty($config['resend_from_email']),
    'curlEnabled' => function_exists('curl_init'),
];

send_json(200, [
    'ok' => $checks['php']['ok'] && $checks['curl']['ok'] && $checks['database']['ok'] && $checks['uploads']['ok'],
    'message' => 'Domainesia health check.',
    'checks' => $checks,
]);
