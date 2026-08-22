<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_vouchers.php';

ensure_method(['POST']);

$pdo = db();
$config = api_config();
$payload = read_json_body();
$bundleProgramId = clean_text($payload['bundleProgramId'] ?? '', 120);
$requestedBundleItems = is_array($payload['bundleItems'] ?? null) ? $payload['bundleItems'] : [];
$buyerName = clean_text($payload['buyerName'] ?? '', 120);
$buyerEmailWarning = checkout_email_validation_message($payload['buyerEmail'] ?? '');
$buyerEmail = clean_email($payload['buyerEmail'] ?? '');
$buyerPhoneWarning = checkout_phone_validation_message($payload['buyerPhone'] ?? '');
$buyerPhone = clean_phone($payload['buyerPhone'] ?? '');
$paymentMethod = strtoupper(clean_text($payload['paymentMethod'] ?? '', 40));
$acceptedTerms = ($payload['acceptedTerms'] ?? false) === true;
$acceptedMarketing = ($payload['acceptedMarketing'] ?? false) === true;
$voucherCode = voucher_clean_code($payload['voucherCode'] ?? '');

if ($bundleProgramId === '') {
    send_json(400, ['message' => 'ID program bundling wajib dikirim.']);
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

$settings = fetch_website_settings($pdo);
$bundleRules = is_array($settings['bundling'] ?? null) ? $settings['bundling'] : [];

if (empty($bundleRules['enabled'])) {
    send_json(422, ['message' => 'Program bundling sedang tidak aktif.']);
}

$bundleProgram = null;

foreach (($bundleRules['programs'] ?? []) as $program) {
    if (($program['id'] ?? '') === $bundleProgramId && !empty($program['active'])) {
        $bundleProgram = $program;
        break;
    }
}

if (!$bundleProgram) {
    send_json(404, ['message' => 'Program bundling tidak ditemukan atau sudah tidak aktif.']);
}

if (($bundleProgram['priceMode'] ?? '') === 'fixed') {
    $requestedBundleItems = is_array($bundleProgram['eligibleItems'] ?? null)
        ? $bundleProgram['eligibleItems']
        : [];
}

$memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
$memberQuery->execute(['member', $buyerEmail]);
$existingMember = $memberQuery->fetch() ?: null;
$eligibleKeys = [];

foreach (($bundleProgram['eligibleItems'] ?? []) as $eligibleItem) {
    $type = clean_text($eligibleItem['type'] ?? '', 40);
    $id = clean_text($eligibleItem['id'] ?? '', 120);

    if ($type !== '' && $id !== '') {
        $eligibleKeys[$type . ':' . $id] = true;
    }
}

$seen = [];
$bundleItems = [];
$subtotal = 0;

foreach (array_slice($requestedBundleItems, 0, 50) as $requestedItem) {
    if (!is_array($requestedItem)) {
        continue;
    }

    $type = clean_text($requestedItem['type'] ?? '', 40);
    $id = clean_text($requestedItem['id'] ?? '', 120);
    $key = $type . ':' . $id;

    if ($id === '' || isset($seen[$key]) || empty($eligibleKeys[$key])) {
        continue;
    }

    $seen[$key] = true;

    if ($type === 'class') {
        if (empty($bundleRules['allowClasses'])) {
            continue;
        }

        if ($existingMember && tripay_has_class_access($existingMember, $id)) {
            continue;
        }

        $query = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
        $query->execute([$id, 'Aktif']);
        $item = $query->fetch();

        if (!$item) {
            continue;
        }

        $price = commerce_class_effective_price($item);
        $bundleItems[] = [
            'type' => 'class',
            'id' => $id,
            'title' => clean_text($item['title'] ?? 'Kelas', 180),
            'price' => $price,
        ];
        $subtotal += $price;
        continue;
    }

    if ($type === 'digital_product') {
        $item = commerce_fetch_product($pdo, $id, true);

        if (!$item) {
            continue;
        }

        $isPrompt = clean_text($item['product_type'] ?? '', 40) === 'prompt';

        if (($isPrompt && empty($bundleRules['allowPrompts']))
            || (!$isPrompt && empty($bundleRules['allowDigitalProducts']))) {
            continue;
        }

        if ($existingMember) {
            $accessQuery = $pdo->prepare(
                'SELECT id FROM digital_product_access
                WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?)
                LIMIT 1',
            );
            $accessQuery->execute([$id, 'active', $existingMember['id'], $buyerEmail]);

            if ($accessQuery->fetch() && empty($item['allow_repeat_purchase'])) {
                continue;
            }
        }

        commerce_assert_product_stock_available($item);
        $price = commerce_product_effective_price($item);
        $bundleItems[] = [
            'type' => 'digital_product',
            'id' => $id,
            'title' => clean_text($item['title'] ?? 'Produk digital', 180),
            'price' => $price,
            'productType' => $isPrompt ? 'prompt' : 'digital',
        ];
        $subtotal += $price;
    }
}

$minimumItems = ($bundleProgram['priceMode'] ?? '') === 'fixed'
    ? 1
    : clean_number($bundleProgram['minimumItems'] ?? 1, 1, 50);

if (count($bundleItems) < $minimumItems) {
    send_json(422, [
        'message' => $existingMember
            ? 'Pilih minimal ' . $minimumItems . ' item yang belum dimiliki akun ini.'
            : 'Pilih minimal ' . $minimumItems . ' item untuk melanjutkan.',
    ]);
}

if ($subtotal < clean_number($bundleRules['minimumSubtotal'] ?? 0, 0, 1000000000)) {
    send_json(422, ['message' => 'Subtotal bundling belum memenuhi batas minimal.']);
}

$discountMode = clean_text($bundleProgram['priceMode'] ?? 'fixed', 20);
$discountPercent = clean_number($bundleProgram['discountPercent'] ?? 0, 0, 100);
$discount = $discountMode === 'fixed'
    ? max(0, $subtotal - clean_number($bundleProgram['fixedPrice'] ?? 0, 0, 1000000000))
    : (int) round($subtotal * $discountPercent / 100);
$maximumDiscount = clean_number($bundleProgram['maximumDiscount'] ?? 0, 0, 1000000000);

if ($maximumDiscount > 0) {
    $discount = min($discount, $maximumDiscount);
}

$amount = max(0, $subtotal - $discount);
$subtotalBeforeVoucher = $amount;
$bundleTitle = clean_text($bundleProgram['title'] ?? 'Paket Bundling', 180);

if ($amount <= 0 && $voucherCode === '') {
    send_json(422, ['message' => 'Total bundling harus lebih dari Rp0.']);
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
        $merchantRef = 'ICBV' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $merchantRef = 'ICBV' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }

    try {
        $voucherContext = voucher_context_from_request($pdo, [
            'orderType' => 'bundle',
            'bundleProgramId' => $bundleProgramId,
            'bundleItems' => $requestedBundleItems,
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
        $accountResult = commerce_find_or_create_member_account($pdo, [
            'memberId' => $existingMember['id'] ?? '',
            'buyerName' => $buyerName,
            'buyerEmail' => $buyerEmail,
            'buyerPhone' => $buyerPhone,
        ], $config);
        $memberId = clean_text($accountResult['member']['id'] ?? '', 120);
        $grantedCount = 0;
        foreach ($bundleItems as $bundleItem) {
            $itemType = clean_text($bundleItem['type'] ?? '', 40);
            $itemId = clean_text($bundleItem['id'] ?? '', 120);
            if ($itemId === '') continue;
            if ($itemType === 'class') {
                if (tripay_grant_class_access($pdo, $memberId, $itemId)) $grantedCount++;
                $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
                $classQuery->execute([$itemId]);
                $classItem = $classQuery->fetch() ?: [];
                commerce_grant_class_bundled_products($pdo, [
                    'class' => $classItem,
                    'memberId' => $memberId,
                    'buyerName' => $buyerName,
                    'buyerEmail' => $buyerEmail,
                ]);
                continue;
            }
            if ($itemType === 'digital_product') {
                $result = commerce_grant_digital_product_access($pdo, [
                    'productId' => $itemId,
                    'memberId' => $memberId,
                    'buyerEmail' => $buyerEmail,
                    'buyerName' => $buyerName,
                    'source' => 'voucher-bundle',
                    'orderId' => $merchantRef . '-' . $itemId,
                    'enforceStockAtGrant' => true,
                ]);
                if (!empty($result['granted'])) $grantedCount++;
            }
        }
        $auditPayload = [
            'order_type' => 'bundle',
            'public_checkout' => true,
            'bundle_items' => $bundleItems,
            'bundle_subtotal' => $subtotal,
            'bundle_discount' => $discount,
            'bundle_program_id' => $bundleProgramId,
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
            make_id('tripay'), $merchantRef, '', $memberId, $buyerName, $buyerEmail,
            'bundle:' . $merchantRef, $bundleTitle, 0, 'processed', '', $grantedCount > 0 ? 1 : 0,
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
        send_json(500, ['message' => 'Akses bundling dengan voucher belum dapat diproses. Coba lagi.']);
    }

    $emailResult = send_bundle_access_credentials_email([
        'buyerName' => $buyerName,
        'buyerEmail' => $buyerEmail,
        'username' => $accountResult['member']['username'] ?? '',
        'password' => $accountResult['password'] ?? null,
        'bundleTitle' => $bundleTitle,
        'bundleItems' => $bundleItems,
        'loginUrl' => $accountResult['loginUrl'] ?? commerce_login_url($config),
    ]);
    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $grantedCount > 0,
        'memberAccountCreated' => !empty($accountResult['created']),
        'grantedCount' => $grantedCount,
        'voucherApplied' => true,
        'voucher' => $voucherData,
        'subtotal' => $subtotalBeforeVoucher,
        'discountAmount' => (int) $voucherCalculation['discountAmount'],
        'finalAmount' => 0,
        'merchantRef' => $merchantRef,
        'loginUrl' => $accountResult['loginUrl'] ?? commerce_login_url($config),
        'emailSent' => $emailResult['sent'] ?? false,
        'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
        'message' => 'Voucher berhasil digunakan dan seluruh akses bundling sudah diproses.',
    ]);
}

if ($paymentMethod === '') {
    send_json(422, ['message' => 'Pilih metode pembayaran terlebih dahulu.']);
}

tripay_assert_config($config);

if ($merchantRef === '') {
    try {
        $merchantRef = 'ICB' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $merchantRef = 'ICB' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }
}

$merchantCode = tripay_config_value($config, 'tripay_merchant_code', 80);
$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '')
    ?: tripay_absolute_url('/api/tripay-webhook.php');
$returnUrl = commerce_login_url($config);
$tripayCustomerPhone = tripay_customer_phone($buyerPhone);
$checkoutPayload = [
    'method' => $paymentMethod,
    'merchant_ref' => $merchantRef,
    'amount' => $amount,
    'customer_name' => $buyerName,
    'customer_email' => $buyerEmail,
    'order_items' => [[
        'sku' => clean_text('BUNDLE-' . $bundleProgramId, 80),
        'name' => $bundleTitle,
        'price' => $amount,
        'quantity' => 1,
    ]],
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
    $existingMember['id'] ?? '',
    $buyerName,
    $buyerEmail,
    'bundle:' . $merchantRef,
    $bundleTitle,
    $amount,
    'pending',
    $checkoutUrl,
    json_encode([
        'order_type' => 'bundle',
        'public_checkout' => true,
        'bundle_items' => $bundleItems,
        'bundle_subtotal' => $subtotal,
        'bundle_discount' => $discount,
        'bundle_program_id' => $bundleProgramId,
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
    'itemTitle' => $bundleTitle,
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
    'message' => 'Checkout bundling berhasil dibuat. Invoice pembayaran dikirim ke email.',
]);
