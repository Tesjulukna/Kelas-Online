<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';

ensure_method(['GET']);

$config = api_config();
tripay_assert_config($config);

if (!function_exists('curl_init')) {
    send_json(500, ['message' => 'Ekstensi cURL PHP belum aktif untuk menghubungi Tripay.']);
}

$curl = curl_init(tripay_api_base_url($config) . '/merchant/payment-channel');
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . tripay_config_value($config, 'tripay_api_key', 300),
        'Accept: application/json',
        'User-Agent: ibnucreative-domainesia-tripay-methods',
    ],
    CURLOPT_TIMEOUT => 25,
]);

$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

$data = json_decode((string) $body, true);
$data = is_array($data) ? $data : [];

if ($body === false || $error !== '' || $status < 200 || $status >= 300 || ($data['success'] ?? true) === false) {
    send_json($status >= 400 ? $status : 502, [
        'message' => clean_text($data['message'] ?? $data['error'] ?? 'Metode pembayaran Tripay belum bisa dibaca.', 240),
    ]);
}

$channels = is_array($data['data'] ?? null) ? $data['data'] : [];
$paymentMethods = [];

foreach ($channels as $channel) {
    if (!is_array($channel)) {
        continue;
    }

    $code = clean_text($channel['code'] ?? '', 40);

    if ($code === '') {
        continue;
    }

    $paymentMethods[] = [
        'id' => strtolower($code),
        'code' => $code,
        'name' => clean_text($channel['name'] ?? $code, 120),
        'label' => clean_text($channel['name'] ?? $code, 120),
        'brand' => strtolower($code),
        'group' => clean_text($channel['group'] ?? '', 80),
        'iconUrl' => clean_asset_url($channel['icon_url'] ?? ($channel['icon'] ?? ''), 1000),
        'logoUrl' => clean_asset_url($channel['icon_url'] ?? ($channel['icon'] ?? ''), 1000),
        'active' => true,
        'feeFlat' => (int) ($channel['total_fee']['flat'] ?? $channel['fee_customer']['flat'] ?? 0),
        'feePercent' => (float) ($channel['total_fee']['percent'] ?? $channel['fee_customer']['percent'] ?? 0),
        'feeCustomer' => [
            'flat' => (int) ($channel['total_fee']['flat'] ?? $channel['fee_customer']['flat'] ?? 0),
            'percent' => (float) ($channel['total_fee']['percent'] ?? $channel['fee_customer']['percent'] ?? 0),
        ],
    ];
}

send_json(200, [
    'paymentMethods' => $paymentMethods,
    'updatedAt' => date(DATE_ATOM),
]);
