<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_vouchers.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$classId = clean_text($payload['classId'] ?? '', 120);
$buyerName = clean_text($payload['buyerName'] ?? '', 120);
$buyerEmailWarning = checkout_email_validation_message($payload['buyerEmail'] ?? '');
$buyerEmail = clean_email($payload['buyerEmail'] ?? '');
$buyerPhoneWarning = checkout_phone_validation_message($payload['buyerPhone'] ?? '');
$buyerPhone = clean_phone($payload['buyerPhone'] ?? '');
$paymentMethod = strtoupper(clean_text($payload['paymentMethod'] ?? '', 40));
$acceptedTerms = ($payload['acceptedTerms'] ?? false) === true;
$acceptedMarketing = ($payload['acceptedMarketing'] ?? false) === true;
$voucherCode = voucher_clean_code($payload['voucherCode'] ?? '');

if ($classId === '') {
    send_json(400, ['message' => 'ID kelas wajib dikirim.']);
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

tripay_ensure_schema($pdo);

$classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
$classQuery->execute([$classId, 'Aktif']);
$class = $classQuery->fetch();

if (!$class) {
    send_json(404, ['message' => 'Kelas aktif tidak ditemukan.']);
}

$amount = commerce_class_effective_price($class);
$subtotalBeforeVoucher = $amount;
$config = api_config();

if ($amount <= 0 && $voucherCode === '') {
    $accessResult = commerce_grant_class_account_access($pdo, [
        'classId' => $class['id'],
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'buyerPhone' => $buyerPhone,
    ], $config);
    $bundleItems = commerce_grant_class_bundled_products($pdo, [
        'class' => $class,
        'memberId' => $accessResult['member']['id'] ?? '',
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
    ]);
    $emailResult = send_class_access_credentials_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'username' => $accessResult['member']['username'] ?? '',
        'password' => $accessResult['password'],
        'classTitle' => $class['title'] ?? 'Kelas IbnuCreative',
        'purchaseMessage' => $class['purchase_message'] ?? '',
        'loginUrl' => $accessResult['loginUrl'],
    ]);
    $bundleEmailResult = send_class_bundle_access_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'classTitle' => $class['title'] ?? 'Kelas IbnuCreative',
        'bundleItems' => $bundleItems,
    ]);

    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $accessResult['accessGranted'],
        'alreadyHasAccess' => !$accessResult['accessGranted'],
        'loginUrl' => $accessResult['loginUrl'],
        'emailSent' => $emailResult['sent'] ?? false,
        'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
        'bundleAccessCount' => count($bundleItems),
        'bundleEmailSent' => $bundleEmailResult['sent'] ?? false,
        'bundleEmailError' => !$bundleItems || !empty($bundleEmailResult['sent']) ? '' : ($bundleEmailResult['message'] ?? ''),
        'message' => 'Akses kelas gratis sudah aktif. Data login dikirim ke email.',
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
        $merchantRef = 'ICCV' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $merchantRef = 'ICCV' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }

    try {
        $voucherContext = voucher_context_from_request($pdo, [
            'orderType' => 'public_class',
            'classId' => $class['id'],
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
                // The expiry worker remains the final safety net.
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
        $accessResult = commerce_grant_class_account_access($pdo, [
            'classId' => $class['id'],
            'buyerName' => $buyerName,
            'buyerEmail' => $buyerEmail,
            'buyerPhone' => $buyerPhone,
        ], $config);
        $bundleItems = commerce_grant_class_bundled_products($pdo, [
            'class' => $class,
            'memberId' => $accessResult['member']['id'] ?? '',
            'buyerName' => $buyerName,
            'buyerEmail' => $buyerEmail,
        ]);
        $auditPayload = [
            'order_type' => 'public_class',
            'public_checkout' => true,
            'class_id' => $class['id'],
            'class_title' => $class['title'],
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
            make_id('tripay'), $merchantRef, '', $accessResult['member']['id'] ?? '', $buyerName, $buyerEmail,
            $class['id'], $class['title'], 0, 'processed', '', 1,
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
        send_json(500, ['message' => 'Akses kelas dengan voucher belum dapat diproses. Coba lagi.']);
    }

    $emailResult = send_class_access_credentials_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'username' => $accessResult['member']['username'] ?? '',
        'password' => $accessResult['password'],
        'classTitle' => $class['title'] ?? 'Kelas IbnuCreative',
        'purchaseMessage' => $class['purchase_message'] ?? '',
        'loginUrl' => $accessResult['loginUrl'],
    ]);
    $bundleEmailResult = send_class_bundle_access_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'classTitle' => $class['title'] ?? 'Kelas IbnuCreative',
        'bundleItems' => $bundleItems,
    ]);
    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $accessResult['accessGranted'],
        'alreadyHasAccess' => !$accessResult['accessGranted'],
        'voucherApplied' => true,
        'voucher' => $voucherData,
        'subtotal' => $subtotalBeforeVoucher,
        'discountAmount' => (int) $voucherCalculation['discountAmount'],
        'finalAmount' => 0,
        'merchantRef' => $merchantRef,
        'loginUrl' => $accessResult['loginUrl'],
        'emailSent' => $emailResult['sent'] ?? false,
        'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
        'bundleAccessCount' => count($bundleItems),
        'bundleEmailSent' => $bundleEmailResult['sent'] ?? false,
        'message' => 'Voucher berhasil digunakan dan akses kelas sudah aktif.',
    ]);
}

if ($paymentMethod === '') {
    send_json(422, ['message' => 'Pilih metode pembayaran dulu.']);
}

tripay_assert_config($config);

if ($merchantRef === '') {
    try {
        $merchantRef = 'ICC' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $merchantRef = 'ICC' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }
}

$merchantCode = tripay_config_value($config, 'tripay_merchant_code', 80);
$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '') ?: tripay_absolute_url('/api/tripay-webhook.php');
$returnUrl = commerce_login_url($config);
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
    'itemTitle' => clean_text($class['title'] ?? 'Kelas IbnuCreative', 160),
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
    'message' => 'Checkout kelas berhasil dibuat. Invoice pembayaran dikirim ke email.',
]);
