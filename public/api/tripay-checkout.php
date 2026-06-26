<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';

ensure_method(['POST']);

$user = require_user('member');
$pdo = db();
$config = api_config();
$payload = read_json_body();
$classId = clean_text($payload['classId'] ?? '', 120);
$productId = clean_text($payload['productId'] ?? '', 120);
$checkoutType = $productId !== '' ? 'digital_product' : 'class';

if ($classId === '' && $productId === '') {
    send_json(400, ['message' => 'ID kelas atau produk wajib dikirim.']);
}

tripay_ensure_schema($pdo);

$memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
$memberQuery->execute([$user['userId'], 'member']);
$member = $memberQuery->fetch();

if (!$member) {
    send_json(404, ['message' => 'Akun member tidak ditemukan.']);
}

$checkoutItem = null;

if ($checkoutType === 'digital_product') {
    $checkoutItem = commerce_fetch_product($pdo, $productId, true);

    if (!$checkoutItem) {
        send_json(404, ['message' => 'Produk digital aktif tidak ditemukan.']);
    }

    $accessQuery = $pdo->prepare(
        'SELECT id FROM digital_product_access
        WHERE product_id = ? AND (member_id = ? OR buyer_email = ?)
        LIMIT 1',
    );
    $accessQuery->execute([$productId, $member['id'], clean_email($member['email'] ?? '')]);

    if ($accessQuery->fetch()) {
        send_json(200, [
            'ok' => true,
            'alreadyHasAccess' => true,
            'message' => 'Akses produk digital sudah aktif.',
        ]);
    }
} else {
    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
    $classQuery->execute([$classId, 'Aktif']);
    $checkoutItem = $classQuery->fetch();

    if (!$checkoutItem) {
        send_json(404, ['message' => 'Kelas aktif tidak ditemukan.']);
    }
}

if ($checkoutType === 'class' && tripay_has_class_access($member, $classId)) {
    send_json(200, [
        'ok' => true,
        'alreadyHasAccess' => true,
        'message' => 'Akses kelas sudah aktif.',
    ]);
}

$amount = $checkoutType === 'digital_product'
    ? commerce_product_effective_price($checkoutItem)
    : commerce_class_effective_price($checkoutItem);

if ($amount <= 0) {
    if ($checkoutType === 'digital_product') {
        $orderCode = 'FREE-MEMBER-' . $checkoutItem['id'] . '-' . time();
        $accessResult = commerce_grant_digital_product_access($pdo, [
            'productId' => $checkoutItem['id'],
            'memberId' => $member['id'],
            'buyerEmail' => $member['email'] ?? '',
            'buyerName' => $member['name'] ?? 'Member',
            'source' => 'free-member',
            'orderId' => $orderCode,
        ]);
        send_digital_product_delivery_email([
            'buyerName' => $member['name'] ?? 'Member',
            'buyerEmail' => $member['email'] ?? '',
            'productTitle' => $checkoutItem['title'] ?? 'Produk digital',
            'downloadUrl' => clean_asset_url($checkoutItem['file_url'] ?? commerce_public_product_access_url($orderCode), 1000),
            'deliveryNote' => $checkoutItem['delivery_note'] ?? '',
        ]);

        send_json(200, [
            'ok' => true,
            'freeAccessGranted' => $accessResult['granted'],
            'alreadyHasAccess' => !$accessResult['granted'],
            'message' => $accessResult['granted']
                ? 'Akses produk gratis sudah aktif.'
                : 'Akses produk sudah aktif.',
        ]);
    }

    $accessGranted = tripay_grant_class_access($pdo, $member['id'], $checkoutItem['id']);

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
$method = strtoupper(clean_text($payload['paymentMethod'] ?? '', 40));
$method = $method ?: (tripay_config_value($config, 'tripay_default_method', 40) ?: 'QRIS');
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
            'sku' => clean_text(($checkoutItem['tripay_product_key'] ?? '') ?: $checkoutItem['id'], 80),
            'name' => clean_text($checkoutItem['title'] ?? 'IbnuCreative', 160),
            'price' => $amount,
            'quantity' => 1,
        ],
    ],
    'callback_url' => $callbackUrl,
    'return_url' => $checkoutType === 'digital_product'
        ? commerce_public_product_access_url($merchantRef)
        : $returnUrl,
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
    $checkoutType === 'digital_product' ? 'product:' . $checkoutItem['id'] : $checkoutItem['id'],
    $checkoutItem['title'],
    $amount,
    'pending',
    $checkoutUrl,
    json_encode([
        'order_type' => $checkoutType,
        'product_id' => $checkoutType === 'digital_product' ? $checkoutItem['id'] : '',
        'product_title' => $checkoutType === 'digital_product' ? $checkoutItem['title'] : '',
        'delivery_url' => $checkoutType === 'digital_product' ? ($checkoutItem['file_url'] ?? '') : '',
        'delivery_note' => $checkoutType === 'digital_product' ? ($checkoutItem['delivery_note'] ?? '') : '',
        'payment_method' => $method,
        'payment_name' => $method,
        'data' => $tripayData,
        'response' => $tripayResponse['data'],
    ], JSON_UNESCAPED_UNICODE),
]);

$emailResult = send_tripay_payment_email([
    'buyerName' => clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 160),
    'buyerEmail' => $buyerEmail,
    'itemTitle' => clean_text($checkoutItem['title'] ?? 'IbnuCreative', 160),
    'amount' => $amount,
    'totalAmount' => $amount,
    'paymentMethod' => $method,
    'checkoutUrl' => $checkoutUrl,
]);

send_json(200, [
    'ok' => true,
    'checkoutUrl' => $checkoutUrl,
    'merchantRef' => $merchantRef,
    'reference' => $reference,
    'paymentMethod' => $method,
    'emailSent' => $emailResult['sent'] ?? false,
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    'message' => 'Checkout Tripay berhasil dibuat.',
]);
