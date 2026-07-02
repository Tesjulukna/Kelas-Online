<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$productId = clean_text($payload['productId'] ?? '', 120);
$buyerName = clean_text($payload['buyerName'] ?? '', 120);
$buyerEmail = clean_email($payload['buyerEmail'] ?? '');
$buyerPhone = clean_phone($payload['buyerPhone'] ?? '');
$paymentMethod = strtoupper(clean_text($payload['paymentMethod'] ?? '', 40));
$acceptedTerms = ($payload['acceptedTerms'] ?? false) === true;
$acceptedMarketing = ($payload['acceptedMarketing'] ?? false) === true;

if ($productId === '') {
    send_json(400, ['message' => 'ID produk wajib dikirim.']);
}

if ($buyerName === '' || $buyerEmail === '' || $buyerPhone === '') {
    send_json(422, ['message' => 'Nama, email, dan nomor HP wajib diisi.']);
}

if (!$acceptedTerms || !$acceptedMarketing) {
    send_json(422, ['message' => 'Centang persetujuan checkout terlebih dahulu.']);
}

$product = commerce_fetch_product($pdo, $productId, true);

if (!$product) {
    send_json(404, ['message' => 'Produk digital aktif tidak ditemukan.']);
}

commerce_assert_product_stock_available($product);

$config = api_config();
$amount = commerce_product_effective_price($product);

if ($amount <= 0) {
    $freeOrderId = 'FREE-PUBLIC-' . $product['id'] . '-' . time();
    $accountResult = commerce_grant_product_member_account($pdo, [
        'productId' => $product['id'],
        'buyerEmail' => $buyerEmail,
        'buyerName' => $buyerName,
        'buyerPhone' => $buyerPhone,
    ], $config);
    $accessResult = commerce_grant_digital_product_access($pdo, [
        'productId' => $product['id'],
        'memberId' => $accountResult['member']['id'] ?? '',
        'buyerEmail' => $buyerEmail,
        'buyerName' => $buyerName,
        'source' => 'free-public',
        'orderId' => $freeOrderId,
    ]);
    $productType = clean_text($product['product_type'] ?? 'digital', 40);
    $accessUrl = commerce_public_product_access_url($accessResult['access']['order_id'] ?? $freeOrderId, $productType);
    $emailResult = send_digital_product_delivery_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'productTitle' => $product['title'] ?? 'Produk digital',
        'productType' => clean_text($product['product_type'] ?? 'digital', 40),
        'downloadUrl' => $accessUrl ?: clean_asset_url($product['file_url'] ?? '', 1000),
        'deliveryNote' => $product['delivery_note'] ?? '',
    ]);
    $accountEmailResult = !empty($accountResult['enabled'])
        ? send_product_access_credentials_email([
            'buyerName' => $buyerName,
            'buyerEmail' => $buyerEmail,
            'username' => clean_text($accountResult['member']['username'] ?? '', 120),
            'password' => $accountResult['password'],
            'productTitle' => clean_text($product['title'] ?? 'Produk digital', 180),
            'loginUrl' => $accountResult['loginUrl'],
            'accessUrl' => $accessUrl,
        ])
        : ['sent' => false, 'message' => 'Akun otomatis produk tidak aktif.'];

    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $accessResult['granted'],
        'memberAccountCreated' => !empty($accountResult['enabled']),
        'accessUrl' => $accessUrl,
        'emailSent' => $emailResult['sent'] ?? false,
        'accountEmailSent' => $accountEmailResult['sent'] ?? false,
        'message' => 'Produk gratis sudah bisa diakses dan dikirim ke email.',
    ]);
}

if ($paymentMethod === '') {
    send_json(422, ['message' => 'Pilih metode pembayaran dulu.']);
}

tripay_assert_config($config);

try {
    $merchantRef = 'ICP' . time() . strtoupper(bin2hex(random_bytes(3)));
} catch (Throwable $error) {
    $merchantRef = 'ICP' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
}

$merchantCode = tripay_config_value($config, 'tripay_merchant_code', 80);
$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$expiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '') ?: tripay_absolute_url('/api/tripay-webhook.php');
$productType = clean_text($product['product_type'] ?? 'digital', 40);
$returnUrl = commerce_public_product_access_url($merchantRef, $productType) ?: (clean_external_url($config['tripay_return_url'] ?? '') ?: tripay_absolute_url('/'));

$checkoutPayload = [
    'method' => $paymentMethod,
    'merchant_ref' => $merchantRef,
    'amount' => $amount,
    'customer_name' => $buyerName,
    'customer_email' => $buyerEmail,
    'customer_phone' => $buyerPhone,
    'order_items' => [
        [
            'sku' => clean_text(($product['tripay_product_key'] ?? '') ?: $product['id'], 80),
            'name' => clean_text($product['title'] ?? 'Produk digital', 160),
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
    'product:' . $product['id'],
    $product['title'],
    $amount,
    'pending',
    $checkoutUrl,
    json_encode([
        'order_type' => 'digital_product',
        'product_type' => clean_text($product['product_type'] ?? 'digital', 40),
        'public_checkout' => true,
        'product_id' => $product['id'],
        'product_title' => $product['title'],
        'delivery_url' => $product['file_url'] ?? '',
        'delivery_note' => $product['delivery_note'] ?? '',
        'auto_create_member' => commerce_flag_enabled($product['auto_create_member'] ?? 0),
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
    'itemTitle' => clean_text($product['title'] ?? 'Produk digital', 160),
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
    'message' => 'Checkout produk digital berhasil dibuat.',
]);
