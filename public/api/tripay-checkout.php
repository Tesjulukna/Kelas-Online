<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_vouchers.php';

ensure_method(['POST']);

$user = require_user('member');
$pdo = db();
$config = api_config();
$payload = read_json_body();
$classId = clean_text($payload['classId'] ?? '', 120);
$productId = clean_text($payload['productId'] ?? '', 120);
$requestedBundleItems = is_array($payload['bundleItems'] ?? null) ? $payload['bundleItems'] : [];
$bundleProgramId = clean_text($payload['bundleProgramId'] ?? '', 120);
$voucherCode = voucher_clean_code($payload['voucherCode'] ?? $payload['code'] ?? '');
$requestedBuyerPhone = clean_phone($payload['buyerPhone'] ?? '');
$checkoutType = $requestedBundleItems ? 'bundle' : ($productId !== '' ? 'digital_product' : 'class');

if ($classId === '' && $productId === '' && !$requestedBundleItems) {
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

if ($checkoutType === 'bundle') {
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
    if (!$bundleProgram) send_json(422, ['message' => 'Program bundling tidak ditemukan atau sudah tidak aktif.']);
    if (($bundleProgram['priceMode'] ?? '') === 'fixed') {
        $requestedBundleItems = is_array($bundleProgram['eligibleItems'] ?? null) ? $bundleProgram['eligibleItems'] : [];
    }
    $eligibleKeys = [];
    foreach (($bundleProgram['eligibleItems'] ?? []) as $eligibleItem) {
        $eligibleKeys[clean_text($eligibleItem['type'] ?? '', 40) . ':' . clean_text($eligibleItem['id'] ?? '', 120)] = true;
    }
    $seen = [];
    $bundleItems = [];
    $subtotal = 0;
    foreach (array_slice($requestedBundleItems, 0, 50) as $requestedItem) {
        $type = clean_text($requestedItem['type'] ?? '', 40);
        $id = clean_text($requestedItem['id'] ?? '', 120);
        $key = $type . ':' . $id;
        if ($id === '' || isset($seen[$key]) || empty($eligibleKeys[$key])) continue;
        $seen[$key] = true;
        if ($type === 'class') {
            if (empty($bundleRules['allowClasses']) || tripay_has_class_access($member, $id)) continue;
            $query = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
            $query->execute([$id, 'Aktif']);
            $item = $query->fetch();
            if (!$item) continue;
            $price = commerce_class_effective_price($item);
            $bundleItems[] = ['type' => 'class', 'id' => $id, 'title' => clean_text($item['title'] ?? 'Kelas', 180), 'price' => $price];
            $subtotal += $price;
            continue;
        }
        if ($type === 'digital_product') {
            $item = commerce_fetch_product($pdo, $id, true);
            if (!$item) continue;
            $isPrompt = clean_text($item['product_type'] ?? '', 40) === 'prompt';
            if (($isPrompt && empty($bundleRules['allowPrompts'])) || (!$isPrompt && empty($bundleRules['allowDigitalProducts']))) continue;
            $accessQuery = $pdo->prepare('SELECT id FROM digital_product_access WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?) LIMIT 1');
            $accessQuery->execute([$id, 'active', $member['id'], clean_email($member['email'] ?? '')]);
            if ($accessQuery->fetch() && empty($item['allow_repeat_purchase'])) continue;
            commerce_assert_product_stock_available($item);
            $price = commerce_product_effective_price($item);
            $bundleItems[] = ['type' => 'digital_product', 'id' => $id, 'title' => clean_text($item['title'] ?? 'Produk digital', 180), 'price' => $price, 'productType' => $isPrompt ? 'prompt' : 'digital'];
            $subtotal += $price;
        }
    }
    $minimumItems = ($bundleProgram['priceMode'] ?? '') === 'fixed'
        ? 1
        : clean_number($bundleProgram['minimumItems'] ?? 1, 1, 50);
    if (count($bundleItems) < $minimumItems) {
        send_json(422, ['message' => 'Pilih minimal ' . $minimumItems . ' item yang belum dimiliki.']);
    }
    if ($subtotal < clean_number($bundleRules['minimumSubtotal'] ?? 0, 0, 1000000000)) {
        send_json(422, ['message' => 'Subtotal bundling belum memenuhi batas minimal.']);
    }
    $discountMode = clean_text($bundleProgram['priceMode'] ?? 'fixed', 20);
    $isFixedPackage = $discountMode === 'fixed';
    $fixedPackagePrice = clean_number($bundleProgram['fixedPrice'] ?? 0, 0, 1000000000);
    $discountPercent = clean_number($bundleProgram['discountPercent'] ?? 0, 0, 100);
    $discount = $isFixedPackage
        ? max(0, $subtotal - $fixedPackagePrice)
        : (int) round($subtotal * $discountPercent / 100);
    $maximumDiscount = clean_number($bundleProgram['maximumDiscount'] ?? 0, 0, 1000000000);
    if (!$isFixedPackage && $maximumDiscount > 0) $discount = min($discount, $maximumDiscount);
    $checkoutItem = [
        'id' => 'custom-bundle',
        'title' => clean_text($bundleProgram['title'] ?? 'Custom Bundling', 180),
        'price' => $isFixedPackage ? $fixedPackagePrice : max(0, $subtotal - $discount),
        'sale_price' => 0,
        'bundle_items' => $bundleItems,
        'bundle_subtotal' => $subtotal,
        'bundle_discount' => $discount,
        'bundle_program_id' => $bundleProgramId,
    ];
} elseif ($checkoutType === 'digital_product') {
    $checkoutItem = commerce_fetch_product($pdo, $productId, true);

    if (!$checkoutItem) {
        send_json(404, ['message' => 'Produk digital aktif tidak ditemukan.']);
    }

    $accessQuery = $pdo->prepare(
        'SELECT id, order_id FROM digital_product_access
        WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?)
        LIMIT 1',
    );
    $accessQuery->execute([$productId, 'active', $member['id'], clean_email($member['email'] ?? '')]);
    $existingAccess = $accessQuery->fetch();

    if ($existingAccess && empty($checkoutItem['allow_repeat_purchase'])) {
        $accessOrderId = clean_text($existingAccess['order_id'] ?? '', 180);

        send_json(200, [
            'ok' => true,
            'alreadyHasAccess' => true,
            'accessOrderId' => $accessOrderId,
            'accessUrl' => $accessOrderId !== '' ? commerce_public_product_access_url($accessOrderId) : '',
            'message' => 'Akses produk digital sudah aktif.',
        ]);
    }

    commerce_assert_product_stock_available($checkoutItem);
} else {
    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
    $classQuery->execute([$classId, 'Aktif']);
    $checkoutItem = $classQuery->fetch();

    if (!$checkoutItem) {
        send_json(404, ['message' => 'Kelas aktif tidak ditemukan.']);
    }
}

if ($checkoutType === 'class' && tripay_has_class_access($member, $classId)) {
    $bundleItems = commerce_grant_class_bundled_products($pdo, [
        'class' => $checkoutItem,
        'memberId' => $member['id'],
        'buyerName' => $member['name'] ?? 'Member',
        'buyerEmail' => $member['email'] ?? '',
    ]);
    $bundleEmailResult = send_class_bundle_access_email([
        'buyerName' => $member['name'] ?? 'Member',
        'buyerEmail' => $member['email'] ?? '',
        'classTitle' => $checkoutItem['title'] ?? 'Kelas IbnuCreative',
        'bundleItems' => $bundleItems,
    ]);

    send_json(200, [
        'ok' => true,
        'alreadyHasAccess' => true,
        'bundleAccessCount' => count($bundleItems),
        'bundleEmailSent' => $bundleEmailResult['sent'] ?? false,
        'bundleEmailError' => !$bundleItems || !empty($bundleEmailResult['sent']) ? '' : ($bundleEmailResult['message'] ?? ''),
        'message' => 'Akses kelas sudah aktif.',
    ]);
}

$buyerEmail = clean_email($member['email'] ?? ($user['email'] ?? ''));
$buyerPhone = $requestedBuyerPhone ?: clean_phone($member['phone'] ?? '');
$normalizedBuyerPhone = tripay_customer_phone($buyerPhone);

$amount = $checkoutType === 'digital_product'
    ? commerce_product_effective_price($checkoutItem)
    : commerce_class_effective_price($checkoutItem);
$subtotalBeforeVoucher = $amount;
$voucherCalculation = null;
$voucherContext = null;

if ($voucherCode !== '') {
    try {
        $voucherRequest = [
            'itemType' => $checkoutType,
            'itemId' => $checkoutType === 'digital_product'
                ? $productId
                : ($checkoutType === 'class' ? $classId : ''),
            'classId' => $classId,
            'productId' => $productId,
            'bundleProgramId' => $bundleProgramId,
            'bundleItems' => $requestedBundleItems,
            'buyerEmail' => $buyerEmail,
        ];
        $voucherContext = voucher_context_from_request($pdo, $voucherRequest, $user);
        $voucherCalculation = voucher_calculate($pdo, $voucherCode, $voucherContext, true);
        $subtotalBeforeVoucher = (int) $voucherCalculation['subtotal'];
        $amount = (int) $voucherCalculation['finalAmount'];
    } catch (VoucherException $error) {
        send_json($error->apiStatus(), [
            'message' => $error->getMessage(),
            'code' => $error->errorCode(),
        ]);
    }
}

if ($amount <= 0 && $voucherCalculation) {
    try {
        $freeOrderRef = 'FREE-VOUCHER-' . time() . strtoupper(bin2hex(random_bytes(3)));
    } catch (Throwable $error) {
        $freeOrderRef = 'FREE-VOUCHER-' . time() . strtoupper(substr(md5(uniqid('', true)), 0, 6));
    }

    try {
        $reservation = voucher_reserve(
            $pdo,
            $voucherCode,
            $voucherContext,
            $freeOrderRef,
            time() + 900,
        );
    } catch (VoucherException $error) {
        send_json($error->apiStatus(), [
            'message' => $error->getMessage(),
            'code' => $error->errorCode(),
        ]);
    }
    $response = [
        'ok' => true,
        'freeAccessGranted' => true,
        'voucherApplied' => true,
        'voucher' => voucher_snapshot($reservation),
        'merchantRef' => $freeOrderRef,
    ];
    $emailResult = ['sent' => false, 'message' => 'Email akses belum diproses.'];

    try {
        $pdo->beginTransaction();
        $accessGranted = true;

        if ($checkoutType === 'bundle') {
            $grantedCount = 0;
            $bundleItems = is_array($checkoutItem['bundle_items'] ?? null)
                ? $checkoutItem['bundle_items']
                : [];

            foreach ($bundleItems as $bundleItem) {
                $itemType = clean_text($bundleItem['type'] ?? '', 40);
                $itemId = clean_text($bundleItem['id'] ?? '', 120);
                if ($itemId === '') continue;

                if ($itemType === 'class') {
                    if (tripay_grant_class_access($pdo, $member['id'], $itemId)) $grantedCount++;
                    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
                    $classQuery->execute([$itemId]);
                    $class = $classQuery->fetch() ?: [];
                    commerce_grant_class_bundled_products($pdo, [
                        'class' => $class,
                        'memberId' => $member['id'],
                        'buyerName' => $member['name'] ?? 'Member',
                        'buyerEmail' => $buyerEmail,
                    ]);
                    continue;
                }

                if ($itemType === 'digital_product') {
                    $result = commerce_grant_digital_product_access($pdo, [
                        'productId' => $itemId,
                        'memberId' => $member['id'],
                        'buyerEmail' => $buyerEmail,
                        'buyerName' => $member['name'] ?? 'Member',
                        'source' => 'voucher-bundle',
                        'orderId' => $freeOrderRef . '-' . $itemId,
                        'enforceStockAtGrant' => true,
                    ]);
                    if (!empty($result['granted'])) $grantedCount++;
                }
            }

            $response['bundleAccessCount'] = count($bundleItems);
            $response['grantedCount'] = $grantedCount;
            $response['message'] = 'Voucher berhasil digunakan dan seluruh akses bundling sudah aktif.';
        } elseif ($checkoutType === 'digital_product') {
            $accessResult = commerce_grant_digital_product_access($pdo, [
                'productId' => $checkoutItem['id'],
                'memberId' => $member['id'],
                'buyerEmail' => $buyerEmail,
                'buyerName' => $member['name'] ?? 'Member',
                'source' => 'voucher-free',
                'orderId' => $freeOrderRef,
                'enforceStockAtGrant' => true,
            ]);
            $response['accessOrderId'] = $accessResult['access']['order_id'] ?? $freeOrderRef;
            $response['accessUrl'] = commerce_public_product_access_url(
                $response['accessOrderId'],
                clean_text($checkoutItem['product_type'] ?? 'digital', 40),
            );
            $response['alreadyHasAccess'] = empty($accessResult['granted']);
            $response['message'] = 'Voucher berhasil digunakan dan akses produk sudah aktif.';
        } else {
            $classAccessGranted = tripay_grant_class_access($pdo, $member['id'], $checkoutItem['id']);
            $bundledItems = commerce_grant_class_bundled_products($pdo, [
                'class' => $checkoutItem,
                'memberId' => $member['id'],
                'buyerName' => $member['name'] ?? 'Member',
                'buyerEmail' => $buyerEmail,
            ]);
            $response['alreadyHasAccess'] = !$classAccessGranted;
            $response['bundleAccessCount'] = count($bundledItems);
            $response['message'] = 'Voucher berhasil digunakan dan akses kelas sudah aktif.';
        }

        $orderPayload = [
            'order_type' => $checkoutType,
            'free_voucher_checkout' => true,
            'product_type' => $checkoutType === 'digital_product' ? clean_text($checkoutItem['product_type'] ?? 'digital', 40) : '',
            'product_id' => $checkoutType === 'digital_product' ? $checkoutItem['id'] : '',
            'product_title' => $checkoutType === 'digital_product' ? $checkoutItem['title'] : '',
            'bundle_items' => $checkoutType === 'bundle' ? ($checkoutItem['bundle_items'] ?? []) : [],
            'bundle_subtotal' => $checkoutType === 'bundle' ? ($checkoutItem['bundle_subtotal'] ?? 0) : 0,
            'bundle_discount' => $checkoutType === 'bundle' ? ($checkoutItem['bundle_discount'] ?? 0) : 0,
            'bundle_program_id' => $checkoutType === 'bundle' ? ($checkoutItem['bundle_program_id'] ?? '') : '',
            'buyer_phone' => $buyerPhone,
            'payment_method' => 'VOUCHER',
            'payment_name' => 'Voucher 100%',
            'subtotal_before_voucher' => $subtotalBeforeVoucher,
            'voucher_discount' => (int) $voucherCalculation['discountAmount'],
            'voucher' => voucher_snapshot($reservation),
        ];
        $insert = $pdo->prepare(
            'INSERT INTO tripay_orders
            (id, merchant_ref, reference, member_id, buyer_name, buyer_email, class_id, class_title, amount, status, checkout_url, access_granted, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            make_id('tripay'),
            $freeOrderRef,
            '',
            $member['id'],
            clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 160),
            $buyerEmail,
            $checkoutType === 'digital_product'
                ? 'product:' . $checkoutItem['id']
                : ($checkoutType === 'bundle' ? 'bundle:' . $freeOrderRef : $checkoutItem['id']),
            $checkoutItem['title'],
            0,
            'processed',
            '',
            $accessGranted ? 1 : 0,
            json_encode($orderPayload, JSON_UNESCAPED_UNICODE),
        ]);
        if (!voucher_mark_used($pdo, $freeOrderRef)) {
            throw new RuntimeException('Reservasi voucher tidak dapat diselesaikan.');
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        voucher_release($pdo, $freeOrderRef, 'free_access_failed');
        send_json(500, ['message' => 'Voucher valid, tetapi akses belum bisa diaktifkan. Silakan coba lagi.']);
    }

    if ($checkoutType === 'bundle') {
        $emailResult = send_bundle_access_credentials_email([
            'buyerName' => $member['name'] ?? 'Member',
            'buyerEmail' => $buyerEmail,
            'username' => $member['username'] ?? '',
            'password' => null,
            'bundleTitle' => $checkoutItem['title'] ?? 'Paket Bundling IbnuCreative',
            'bundleItems' => $checkoutItem['bundle_items'] ?? [],
            'loginUrl' => commerce_login_url($config),
        ]);
    } elseif ($checkoutType === 'digital_product') {
        $emailResult = send_digital_product_delivery_email([
            'buyerName' => $member['name'] ?? 'Member',
            'buyerEmail' => $buyerEmail,
            'productTitle' => $checkoutItem['title'] ?? 'Produk digital',
            'productType' => clean_text($checkoutItem['product_type'] ?? 'digital', 40),
            'downloadUrl' => $response['accessUrl'] ?? '',
            'deliveryNote' => $checkoutItem['delivery_note'] ?? '',
        ]);
    } else {
        $emailResult = send_class_access_credentials_email([
            'buyerName' => $member['name'] ?? 'Member',
            'buyerEmail' => $buyerEmail,
            'username' => $member['username'] ?? '',
            'password' => null,
            'classTitle' => $checkoutItem['title'] ?? 'Kelas IbnuCreative',
            'purchaseMessage' => $checkoutItem['purchase_message'] ?? '',
            'loginUrl' => commerce_login_url($config),
        ]);
    }

    $response['emailSent'] = $emailResult['sent'] ?? false;
    $response['emailError'] = !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? '');
    send_json(200, $response);
}

if ($amount <= 0) {
    if ($checkoutType === 'bundle') {
        send_json(422, ['message' => 'Total bundling harus lebih dari Rp0.']);
    }
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
            'productType' => clean_text($checkoutItem['product_type'] ?? 'digital', 40),
            'downloadUrl' => clean_asset_url($checkoutItem['file_url'] ?? commerce_public_product_access_url($orderCode, clean_text($checkoutItem['product_type'] ?? 'digital', 40)), 1000),
            'deliveryNote' => $checkoutItem['delivery_note'] ?? '',
        ]);

        send_json(200, [
            'ok' => true,
            'freeAccessGranted' => $accessResult['granted'],
            'alreadyHasAccess' => !$accessResult['granted'],
            'accessOrderId' => $accessResult['access']['order_id'] ?? $orderCode,
            'accessUrl' => commerce_public_product_access_url($accessResult['access']['order_id'] ?? $orderCode, clean_text($checkoutItem['product_type'] ?? 'digital', 40)),
            'message' => $accessResult['granted']
                ? 'Akses produk gratis sudah aktif.'
                : 'Akses produk sudah aktif.',
        ]);
    }

    $accessGranted = tripay_grant_class_access($pdo, $member['id'], $checkoutItem['id']);
    $bundleItems = commerce_grant_class_bundled_products($pdo, [
        'class' => $checkoutItem,
        'memberId' => $member['id'],
        'buyerName' => $member['name'] ?? 'Member',
        'buyerEmail' => $member['email'] ?? '',
    ]);
    $bundleEmailResult = send_class_bundle_access_email([
        'buyerName' => $member['name'] ?? 'Member',
        'buyerEmail' => $member['email'] ?? '',
        'classTitle' => $checkoutItem['title'] ?? 'Kelas IbnuCreative',
        'bundleItems' => $bundleItems,
    ]);

    send_json(200, [
        'ok' => true,
        'freeAccessGranted' => $accessGranted,
        'alreadyHasAccess' => !$accessGranted,
        'bundleAccessCount' => count($bundleItems),
        'bundleEmailSent' => $bundleEmailResult['sent'] ?? false,
        'bundleEmailError' => !$bundleItems || !empty($bundleEmailResult['sent']) ? '' : ($bundleEmailResult['message'] ?? ''),
        'message' => $accessGranted
            ? 'Akses kelas gratis sudah aktif.'
            : 'Akses kelas sudah aktif.',
    ]);
}

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
$normalizedBuyerPhone = tripay_customer_phone($buyerPhone);
if (tripay_method_requires_customer_phone($method) && $normalizedBuyerPhone === '') {
    send_json(422, ['message' => 'Metode e-wallet ini membutuhkan nomor HP Indonesia yang terhubung ke akun DANA, OVO, atau ShopeePay.']);
}
$callbackUrl = clean_external_url($config['tripay_callback_url'] ?? '') ?: tripay_absolute_url('/api/tripay-webhook.php');
$returnUrl = clean_external_url($config['tripay_return_url'] ?? '') ?: tripay_absolute_url('/member?menu=my-courses');
$configuredExpiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
$expiredMinutes = $voucherCode !== '' ? min($configuredExpiredMinutes, 60) : $configuredExpiredMinutes;
$checkoutExpiresAt = time() + ($expiredMinutes * 60);
$reservationExpiresAt = $checkoutExpiresAt + 300;
$voucherReservation = null;
$voucherData = null;
$voucherReservationSettled = true;

if ($voucherCalculation) {
    try {
        $voucherReservation = voucher_reserve(
            $pdo,
            $voucherCode,
            $voucherContext,
            $merchantRef,
            $reservationExpiresAt,
        );
        $voucherData = voucher_snapshot($voucherReservation);
        $subtotalBeforeVoucher = (int) $voucherReservation['subtotal'];
        $amount = (int) $voucherReservation['finalAmount'];
        $voucherReservationSettled = false;
        register_shutdown_function(static function () use ($pdo, $merchantRef, &$voucherReservationSettled): void {
            if ($voucherReservationSettled) return;
            try {
                voucher_release($pdo, $merchantRef, 'checkout_not_created');
            } catch (Throwable $error) {
                // Reservasi kedaluwarsa tetap dibersihkan oleh inti voucher.
            }
        });
    } catch (VoucherException $error) {
        send_json($error->apiStatus(), [
            'message' => $error->getMessage(),
            'code' => $error->errorCode(),
        ]);
    }
}

if ($callbackUrl === '' || $returnUrl === '') {
    send_json(500, ['message' => 'URL callback/return Tripay belum bisa dibuat.']);
}

$checkoutPayload = [
    'method' => $method,
    'merchant_ref' => $merchantRef,
    'amount' => $amount,
    'customer_name' => clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 120),
    'customer_email' => $buyerEmail,
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
        ? commerce_public_product_access_url($merchantRef, clean_text($checkoutItem['product_type'] ?? 'digital', 40))
        : $returnUrl,
    'expired_time' => $checkoutExpiresAt,
    'signature' => tripay_checkout_signature($merchantCode, $merchantRef, $amount, $privateKey),
];

if ($normalizedBuyerPhone !== '') {
    $checkoutPayload['customer_phone'] = $normalizedBuyerPhone;
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
    $member['id'],
    clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 160),
    $buyerEmail,
    $checkoutType === 'digital_product' ? 'product:' . $checkoutItem['id'] : ($checkoutType === 'bundle' ? 'bundle:' . $merchantRef : $checkoutItem['id']),
    $checkoutItem['title'],
    $amount,
    'pending',
    $checkoutUrl,
    json_encode([
        'order_type' => $checkoutType,
        'product_type' => $checkoutType === 'digital_product' ? clean_text($checkoutItem['product_type'] ?? 'digital', 40) : '',
        'product_id' => $checkoutType === 'digital_product' ? $checkoutItem['id'] : '',
        'product_title' => $checkoutType === 'digital_product' ? $checkoutItem['title'] : '',
        'bundle_items' => $checkoutType === 'bundle' ? $checkoutItem['bundle_items'] : [],
        'bundle_subtotal' => $checkoutType === 'bundle' ? $checkoutItem['bundle_subtotal'] : 0,
        'bundle_discount' => $checkoutType === 'bundle' ? $checkoutItem['bundle_discount'] : 0,
        'bundle_program_id' => $checkoutType === 'bundle' ? $checkoutItem['bundle_program_id'] : '',
        'delivery_url' => $checkoutType === 'digital_product' ? ($checkoutItem['file_url'] ?? '') : '',
        'delivery_note' => $checkoutType === 'digital_product' ? ($checkoutItem['delivery_note'] ?? '') : '',
        'payment_method' => $method,
        'payment_name' => $method,
        'buyer_phone' => $buyerPhone,
        'subtotal_before_voucher' => $subtotalBeforeVoucher,
        'voucher_discount' => $voucherReservation ? (int) $voucherReservation['discountAmount'] : 0,
        'voucher' => $voucherData,
        'expired_time' => $checkoutPayload['expired_time'],
        'data' => $tripayData,
        'response' => $tripayResponse['data'],
    ], JSON_UNESCAPED_UNICODE),
]);

if ($voucherReservation) {
    $voucherReservationSettled = true;
}

$emailResult = send_tripay_payment_email([
    'buyerName' => clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 160),
    'buyerEmail' => $buyerEmail,
    'itemTitle' => clean_text($checkoutItem['title'] ?? 'IbnuCreative', 160),
    'amount' => $amount,
    'totalAmount' => $amount,
    'paymentMethod' => $method,
    'checkoutUrl' => $checkoutUrl,
    'subtotal' => $subtotalBeforeVoucher,
    'discountAmount' => $voucherReservation ? (int) $voucherReservation['discountAmount'] : 0,
    'voucher' => $voucherData,
]);

send_json(200, [
    'ok' => true,
    'checkoutUrl' => $checkoutUrl,
    'merchantRef' => $merchantRef,
    'reference' => $reference,
    'paymentMethod' => $method,
    'voucherApplied' => (bool) $voucherReservation,
    'voucher' => $voucherData,
    'subtotal' => $subtotalBeforeVoucher,
    'discountAmount' => $voucherReservation ? (int) $voucherReservation['discountAmount'] : 0,
    'finalAmount' => $amount,
    'emailSent' => $emailResult['sent'] ?? false,
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    'message' => 'Checkout Tripay berhasil dibuat.',
]);
