<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$classId = clean_text($payload['classId'] ?? '', 120);
$buyerName = clean_text($payload['buyerName'] ?? '', 120);
$buyerEmail = clean_email($payload['buyerEmail'] ?? '');
$buyerPhone = clean_phone($payload['buyerPhone'] ?? '');
$paymentMethod = strtoupper(clean_text($payload['paymentMethod'] ?? '', 40));
$acceptedTerms = ($payload['acceptedTerms'] ?? false) === true;
$acceptedMarketing = ($payload['acceptedMarketing'] ?? false) === true;

if ($classId === '') {
    send_json(400, ['message' => 'ID kelas wajib dikirim.']);
}

if ($buyerName === '' || $buyerEmail === '' || $buyerPhone === '') {
    send_json(422, ['message' => 'Nama, email, dan nomor HP wajib diisi.']);
}

if (!$acceptedTerms || !$acceptedMarketing) {
    send_json(422, ['message' => 'Centang persetujuan checkout terlebih dahulu.']);
}

tripay_ensure_schema($pdo);

$classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
$classQuery->execute([$classId, 'Aktif']);
$class = $classQuery->fetch();

if (!$class) {
    send_json(404, ['message' => 'Kelas aktif tidak ditemukan.']);
}

$amount = commerce_class_effective_price($class);
$config = api_config();

if ($amount <= 0) {
    $accessResult = commerce_grant_class_account_access($pdo, [
        'classId' => $class['id'],
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'buyerPhone' => $buyerPhone,
    ], $config);
    $emailResult = send_class_access_credentials_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'username' => $accessResult['member']['username'] ?? '',
        'password' => $accessResult['password'],
        'classTitle' => $class['title'] ?? 'Kelas IbnuCreative',
        'loginUrl' => $accessResult['loginUrl'],
    ]);

    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $accessResult['accessGranted'],
        'alreadyHasAccess' => !$accessResult['accessGranted'],
        'loginUrl' => $accessResult['loginUrl'],
        'emailSent' => $emailResult['sent'] ?? false,
        'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
        'message' => 'Akses kelas gratis sudah aktif. Data login dikirim ke email.',
    ]);
}

if ($paymentMethod === '') {
    send_json(422, ['message' => 'Pilih metode pembayaran dulu.']);
}

tripay_assert_config($config);

try {
    $merchantRef = 'ICC' . time() . strtoupper(bin2hex(random_bytes(3)));
} catch (Throwable $error) {
    $merchantRef = 'ICC' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
}

$merchantCode = tripay_config_value($config, 'tripay_merchant_code', 80);
$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$expiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '') ?: tripay_absolute_url('/api/tripay-webhook');
$returnUrl = commerce_login_url($config);

$checkoutPayload = [
    'method' => $paymentMethod,
    'merchant_ref' => $merchantRef,
    'amount' => $amount,
    'customer_name' => $buyerName,
    'customer_email' => $buyerEmail,
    'customer_phone' => $buyerPhone,
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
    '',
    $buyerName,
    $buyerEmail,
    $class['id'],
    $class['title'],
    $amount,
    'pending',
    $checkoutUrl,
    json_encode([
        'order_type' => 'public_class',
        'public_checkout' => true,
        'class_id' => $class['id'],
        'class_title' => $class['title'],
        'buyer_phone' => $buyerPhone,
        'accepted_marketing' => $acceptedMarketing,
        'payment_method' => $paymentMethod,
        'payment_name' => $paymentMethod,
        'data' => $tripayData,
        'response' => $tripayResponse['data'],
    ], JSON_UNESCAPED_UNICODE),
]);

$emailResult = send_tripay_payment_email([
    'buyerName' => $buyerName,
    'buyerEmail' => $buyerEmail,
    'itemTitle' => clean_text($class['title'] ?? 'Kelas IbnuCreative', 160),
    'amount' => $amount,
    'totalAmount' => $amount,
    'paymentMethod' => $paymentMethod,
    'checkoutUrl' => $checkoutUrl,
]);

send_json(200, [
    'ok' => true,
    'checkoutUrl' => $checkoutUrl,
    'merchantRef' => $merchantRef,
    'reference' => $reference,
    'paymentMethod' => $paymentMethod,
    'emailSent' => $emailResult['sent'] ?? false,
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    'message' => 'Checkout kelas berhasil dibuat. Invoice pembayaran dikirim ke email.',
]);
