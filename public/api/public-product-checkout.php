<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_vouchers.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$productId = clean_text($payload['productId'] ?? '', 120);
$buyerName = clean_text($payload['buyerName'] ?? '', 120);
$buyerEmailWarning = checkout_email_validation_message($payload['buyerEmail'] ?? '');
$buyerEmail = clean_email($payload['buyerEmail'] ?? '');
$buyerPhoneWarning = checkout_phone_validation_message($payload['buyerPhone'] ?? '');
$buyerPhone = clean_phone($payload['buyerPhone'] ?? '');
$paymentMethod = strtoupper(clean_text($payload['paymentMethod'] ?? '', 40));
$acceptedTerms = ($payload['acceptedTerms'] ?? false) === true;
$acceptedMarketing = ($payload['acceptedMarketing'] ?? false) === true;
$voucherCode = voucher_clean_code($payload['voucherCode'] ?? '');

if ($productId === '') {
    send_json(400, ['message' => 'ID produk wajib dikirim.']);
}

if ($buyerEmailWarning !== '') {
    send_json(422, ['message' => $buyerEmailWarning]);
}

if ($buyerPhoneWarning !== '') {
    send_json(422, ['message' => $buyerPhoneWarning]);
}

if ($buyerName === '' || $buyerEmail === '') {
    send_json(422, ['message' => 'Nama dan email wajib diisi.']);
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
$subtotalBeforeVoucher = $amount;

if ($amount <= 0 && $voucherCode === '') {
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

$voucherCalculation = null;
$voucherData = null;
$voucherReservationSettled = true;
$merchantRef = '';
$configuredExpiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
$expiredMinutes = $voucherCode !== '' ? min($configuredExpiredMinutes, 60) : $configuredExpiredMinutes;
$reservationExpiresAt = time() + ($expiredMinutes * 60) + 300;

if ($voucherCode !== '') {
    try {
        $merchantRef = 'ICPV' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $merchantRef = 'ICPV' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }

    try {
        $voucherContext = voucher_context_from_request($pdo, [
            'orderType' => clean_text($product['product_type'] ?? '', 40) === 'prompt' ? 'prompt' : 'digital_product',
            'productId' => $product['id'],
            'buyerEmail' => $buyerEmail,
        ]);
        $voucherCalculation = voucher_reserve(
            $pdo,
            $voucherCode,
            $voucherContext,
            $merchantRef,
            $reservationExpiresAt
        );
        $voucherData = voucher_snapshot($voucherCalculation);
        $amount = (int) $voucherCalculation['finalAmount'];
        $voucherReservationSettled = false;
        register_shutdown_function(static function () use ($pdo, $merchantRef, &$voucherReservationSettled): void {
            if ($voucherReservationSettled) return;
            try {
                voucher_release($pdo, $merchantRef, 'checkout_not_created');
            } catch (Throwable $error) {
                // Expired reservations are also released by the voucher core.
            }
        });
    } catch (VoucherException $error) {
        send_json($error->apiStatus(), [
            'message' => $error->getMessage(),
            'code' => $error->errorCode(),
        ]);
    }
}

if ($voucherCalculation && $amount <= 0) {
    try {
        $pdo->beginTransaction();
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
            'source' => 'voucher-public',
            'orderId' => $merchantRef,
            'enforceStockAtGrant' => true,
        ]);
        $auditPayload = [
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
            'payment_method' => 'VOUCHER',
            'payment_name' => 'Voucher 100%',
            'subtotal_before_voucher' => $subtotalBeforeVoucher,
            'voucher_discount' => (int) $voucherCalculation['discountAmount'],
            'voucher' => $voucherData,
            'zero_total' => true,
        ];
        $insert = $pdo->prepare(
            'INSERT INTO tripay_orders
            (id, merchant_ref, reference, member_id, buyer_name, buyer_email, class_id, class_title, amount, status, checkout_url, access_granted, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            make_id('tripay'), $merchantRef, '', $accountResult['member']['id'] ?? '', $buyerName, $buyerEmail,
            'product:' . $product['id'], $product['title'], 0, 'processed', '', 1,
            json_encode($auditPayload, JSON_UNESCAPED_UNICODE),
        ]);
        if (!voucher_mark_used($pdo, $merchantRef)) {
            throw new RuntimeException('Reservasi voucher tidak dapat diselesaikan.');
        }
        $pdo->commit();
        $voucherReservationSettled = true;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        voucher_release($pdo, $merchantRef, 'zero_checkout_failed');
        $voucherReservationSettled = true;
        send_json(500, ['message' => 'Akses produk dengan voucher belum dapat diproses. Coba lagi.']);
    }

    $productType = clean_text($product['product_type'] ?? 'digital', 40);
    $accessUrl = commerce_public_product_access_url($accessResult['access']['order_id'] ?? $merchantRef, $productType);
    $emailResult = send_digital_product_delivery_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'productTitle' => $product['title'] ?? 'Produk digital',
        'productType' => $productType,
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
        'voucherApplied' => true,
        'voucher' => $voucherData,
        'subtotal' => $subtotalBeforeVoucher,
        'discountAmount' => (int) $voucherCalculation['discountAmount'],
        'finalAmount' => 0,
        'merchantRef' => $merchantRef,
        'accessUrl' => $accessUrl,
        'emailSent' => $emailResult['sent'] ?? false,
        'accountEmailSent' => $accountEmailResult['sent'] ?? false,
        'message' => 'Voucher berhasil digunakan dan produk sudah bisa diakses.',
    ]);
}

if ($paymentMethod === '') {
    send_json(422, ['message' => 'Pilih metode pembayaran dulu.']);
}

tripay_assert_config($config);

if ($merchantRef === '') {
    try {
        $merchantRef = 'ICP' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $merchantRef = 'ICP' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }
}

$merchantCode = tripay_config_value($config, 'tripay_merchant_code', 80);
$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '') ?: tripay_absolute_url('/api/tripay-webhook.php');
$productType = clean_text($product['product_type'] ?? 'digital', 40);
$returnUrl = commerce_public_product_access_url($merchantRef, $productType) ?: (clean_external_url($config['tripay_return_url'] ?? '') ?: tripay_absolute_url('/'));
$tripayCustomerPhone = tripay_customer_phone($buyerPhone);
if (tripay_method_requires_customer_phone($paymentMethod) && $tripayCustomerPhone === '') {
    send_json(422, ['message' => 'Metode e-wallet ini membutuhkan nomor HP Indonesia yang terhubung ke akun pembayaran.']);
}

$checkoutPayload = [
    'method' => $paymentMethod,
    'merchant_ref' => $merchantRef,
    'amount' => $amount,
    'customer_name' => $buyerName,
    'customer_email' => $buyerEmail,
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

if ($tripayCustomerPhone !== '') {
    $checkoutPayload['customer_phone'] = $tripayCustomerPhone;
}

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
        'subtotal_before_voucher' => $subtotalBeforeVoucher,
        'voucher_discount' => $voucherCalculation ? (int) $voucherCalculation['discountAmount'] : 0,
        'voucher' => $voucherData,
        'expired_time' => $checkoutPayload['expired_time'],
        'data' => $tripayData,
        'response' => $tripayResponse['data'],
    ], JSON_UNESCAPED_UNICODE),
]);

if ($voucherCalculation) {
    $voucherReservationSettled = true;
}

$emailResult = send_tripay_payment_email([
    'buyerName' => $buyerName,
    'buyerEmail' => $buyerEmail,
    'itemTitle' => clean_text($product['title'] ?? 'Produk digital', 160),
    'amount' => $amount,
    'totalAmount' => $amount,
    'paymentMethod' => $paymentMethod,
    'checkoutUrl' => $checkoutUrl,
    'subtotal' => $subtotalBeforeVoucher,
    'discountAmount' => $voucherCalculation ? (int) $voucherCalculation['discountAmount'] : 0,
    'voucher' => $voucherData,
]);

send_json(200, [
    'ok' => true,
    'checkoutUrl' => $checkoutUrl,
    'merchantRef' => $merchantRef,
    'reference' => $reference,
    'paymentMethod' => $paymentMethod,
    'voucherApplied' => (bool) $voucherCalculation,
    'voucher' => $voucherData,
    'subtotal' => $subtotalBeforeVoucher,
    'discountAmount' => $voucherCalculation ? (int) $voucherCalculation['discountAmount'] : 0,
    'finalAmount' => $amount,
    'emailSent' => $emailResult['sent'] ?? false,
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    'message' => 'Checkout produk digital berhasil dibuat.',
]);
