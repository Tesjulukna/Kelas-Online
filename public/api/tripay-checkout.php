<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';

ensure_method(['POST']);

$user = require_user('member');
$pdo = db();
$config = api_config();
$payload = read_json_body();
$classId = clean_text($payload['classId'] ?? '', 120);

if ($classId === '') {
    send_json(400, ['message' => 'ID kelas wajib dikirim.']);
}

tripay_ensure_schema($pdo);

$classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
$classQuery->execute([$classId, 'Aktif']);
$class = $classQuery->fetch();

if (!$class) {
    send_json(404, ['message' => 'Kelas aktif tidak ditemukan.']);
}

$memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
$memberQuery->execute([$user['userId'], 'member']);
$member = $memberQuery->fetch();

if (!$member) {
    send_json(404, ['message' => 'Akun member tidak ditemukan.']);
}

if (tripay_has_class_access($member, $classId)) {
    send_json(200, [
        'ok' => true,
        'alreadyHasAccess' => true,
        'message' => 'Akses kelas sudah aktif.',
    ]);
}

$amount = clean_number($class['price'] ?? 0, 0, 1000000000);

if ($amount <= 0) {
    $accessGranted = tripay_grant_class_access($pdo, $member['id'], $class['id']);

    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $accessGranted,
        'alreadyHasAccess' => !$accessGranted,
        'message' => $accessGranted
            ? 'Akses kelas gratis sudah aktif.'
            : 'Akses kelas sudah aktif.',
    ]);
}

$buyerEmail = clean_email($member['email'] ?? ($user['email'] ?? ''));

if ($buyerEmail === '') {
    send_json(422, ['message' => 'Email member wajib diisi sebelum checkout Tripay.']);
}

tripay_assert_config($config);

try {
    $merchantRef = 'IC' . time() . strtoupper(bin2hex(random_bytes(3)));
} catch (Throwable $error) {
    $merchantRef = 'IC' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
}

$merchantCode = tripay_config_value($config, 'tripay_merchant_code', 80);
$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$method = tripay_config_value($config, 'tripay_default_method', 40) ?: 'QRIS';
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '') ?: tripay_absolute_url('/api/tripay-webhook.php');
$returnUrl = clean_external_url($config['tripay_return_url'] ?? '') ?: tripay_absolute_url('/member?menu=my-courses');
$expiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
$customerPhone = tripay_config_value($config, 'tripay_default_customer_phone', 30) ?: '081234567890';

if ($callbackUrl === '' || $returnUrl === '') {
    send_json(500, ['message' => 'URL callback/return Tripay belum bisa dibuat.']);
}

$checkoutPayload = [
    'method' => $method,
    'merchant_ref' => $merchantRef,
    'amount' => $amount,
    'customer_name' => clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 120),
    'customer_email' => $buyerEmail,
    'customer_phone' => $customerPhone,
    'order_items' => [
        [
            'sku' => clean_text(($class['tripay_product_key'] ?? '') ?: $class['id'], 80),
            'name' => clean_text($class['title'] ?? 'Kelas IbnuCreative', 160),
            'price' => $amount,
            'quantity' => 1,
        ],
    ],
    'callback_url' => $callbackUrl,
    'return_url' => $returnUrl,
    'expired_time' => time() + ($expiredMinutes * 60),
    'signature' => tripay_checkout_signature($merchantCode, $merchantRef, $amount, $privateKey),
];

$tripayResponse = tripay_post_transaction($config, $checkoutPayload);
$tripayData = is_array($tripayResponse['data']['data'] ?? null)
    ? $tripayResponse['data']['data']
    : $tripayResponse['data'];
$checkoutUrl = clean_external_url($tripayData['checkout_url'] ?? '');
$checkoutUrl = $checkoutUrl ?: clean_external_url($tripayData['pay_url'] ?? '');
$checkoutUrl = $checkoutUrl ?: clean_external_url($tripayData['payment_url'] ?? '');
$reference = clean_text($tripayData['reference'] ?? '', 180);

if ($checkoutUrl === '') {
    send_json(502, ['message' => 'Tripay tidak mengembalikan URL checkout.']);
}

$insert = $pdo->prepare(
    'INSERT INTO tripay_orders
    (id, merchant_ref, reference, member_id, buyer_name, buyer_email, class_id, class_title, amount, status, checkout_url, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
$insert->execute([
    make_id('tripay'),
    $merchantRef,
    $reference,
    $member['id'],
    clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 160),
    $buyerEmail,
    $class['id'],
    $class['title'],
    $amount,
    'pending',
    $checkoutUrl,
    $tripayResponse['body'],
]);

send_json(200, [
    'ok' => true,
    'checkoutUrl' => $checkoutUrl,
    'merchantRef' => $merchantRef,
    'reference' => $reference,
    'message' => 'Checkout Tripay berhasil dibuat.',
]);
