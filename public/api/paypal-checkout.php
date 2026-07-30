<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_paypal.php';

ensure_method(['POST']);

$pdo = db();
$config = api_config();
$payload = read_json_body();
$user = current_user();
$classId = clean_text($payload['classId'] ?? '', 120);
$productId = clean_text($payload['productId'] ?? '', 120);
$bundleProgramId = clean_text($payload['bundleProgramId'] ?? '', 120);
$requestedBundleItems = is_array($payload['bundleItems'] ?? null) ? $payload['bundleItems'] : [];
$checkoutType = $requestedBundleItems || $bundleProgramId !== ''
    ? 'bundle'
    : ($productId !== '' ? 'digital_product' : 'class');

if ($classId === '' && $productId === '' && $bundleProgramId === '') {
    send_json(400, ['message' => 'Item checkout PayPal belum dipilih.']);
}

paypal_assert_config($config);
paypal_ensure_schema($pdo);
tripay_ensure_schema($pdo);

$member = null;

if (($user['role'] ?? '') === 'member') {
    $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
    $memberQuery->execute([$user['userId'], 'member']);
    $member = $memberQuery->fetch() ?: null;
}

$buyerName = $member
    ? clean_text($member['name'] ?? ($user['name'] ?? 'Member'), 160)
    : clean_text($payload['buyerName'] ?? '', 160);
$buyerEmail = $member
    ? clean_email($member['email'] ?? ($user['email'] ?? ''))
    : clean_email($payload['buyerEmail'] ?? '');
$buyerPhone = clean_phone(
    $member
        ? (($member['phone'] ?? '') ?: ($payload['buyerPhone'] ?? ''))
        : ($payload['buyerPhone'] ?? ''),
);
$acceptedTerms = ($payload['acceptedTerms'] ?? false) === true;
$acceptedMarketing = ($payload['acceptedMarketing'] ?? false) === true;

if (!$member) {
    $emailWarning = checkout_email_validation_message($payload['buyerEmail'] ?? '');
    $phoneWarning = checkout_phone_validation_message($payload['buyerPhone'] ?? '');

    if ($emailWarning !== '') {
        send_json(422, ['message' => $emailWarning]);
    }

    if ($phoneWarning !== '') {
        send_json(422, ['message' => $phoneWarning]);
    }

    if ($buyerName === '' || $buyerEmail === '' || $buyerPhone === '') {
        send_json(422, ['message' => 'Nama, email, dan nomor HP wajib diisi untuk checkout PayPal.']);
    }

    if (!$acceptedTerms || !$acceptedMarketing) {
        send_json(422, ['message' => 'Centang persetujuan checkout terlebih dahulu.']);
    }
}

if ($buyerEmail === '') {
    send_json(422, ['message' => 'Email pembeli wajib tersedia untuk checkout PayPal.']);
}

if (!$member) {
    $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
    $memberQuery->execute(['member', $buyerEmail]);
    $member = $memberQuery->fetch() ?: null;
}

$checkoutItem = null;
$orderPayload = [
    'order_type' => $checkoutType,
    'public_checkout' => ($user['role'] ?? '') !== 'member',
    'buyer_phone' => $buyerPhone,
    'accepted_marketing' => $acceptedMarketing,
    'payment_method' => 'PAYPAL',
    'payment_name' => 'PayPal (USD)',
];

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

    if (!$bundleProgram) {
        send_json(404, ['message' => 'Program bundling tidak ditemukan atau sudah tidak aktif.']);
    }

    if (($bundleProgram['priceMode'] ?? '') === 'fixed') {
        $requestedBundleItems = is_array($bundleProgram['eligibleItems'] ?? null)
            ? $bundleProgram['eligibleItems']
            : [];
    }

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
            if (empty($bundleRules['allowClasses']) || ($member && commerce_member_has_class_access($member, $id))) {
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

            if (
                ($isPrompt && empty($bundleRules['allowPrompts']))
                || (!$isPrompt && empty($bundleRules['allowDigitalProducts']))
            ) {
                continue;
            }

            if ($member) {
                $accessQuery = $pdo->prepare(
                    'SELECT id FROM digital_product_access
                    WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?)
                    LIMIT 1',
                );
                $accessQuery->execute([$id, 'active', $member['id'], $buyerEmail]);

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
            'message' => $member
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

    $checkoutItem = [
        'id' => $bundleProgramId,
        'title' => clean_text($bundleProgram['title'] ?? 'Paket Bundling', 180),
        'price' => max(0, $subtotal - $discount),
    ];
    $orderPayload = array_merge($orderPayload, [
        'bundle_items' => $bundleItems,
        'bundle_subtotal' => $subtotal,
        'bundle_discount' => $discount,
        'bundle_program_id' => $bundleProgramId,
    ]);
} elseif ($checkoutType === 'digital_product') {
    $checkoutItem = commerce_fetch_product($pdo, $productId, true);

    if (!$checkoutItem) {
        send_json(404, ['message' => 'Produk digital aktif tidak ditemukan.']);
    }

    if ($member) {
        $accessQuery = $pdo->prepare(
            'SELECT id, order_id FROM digital_product_access
            WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?)
            LIMIT 1',
        );
        $accessQuery->execute([$productId, 'active', $member['id'], $buyerEmail]);
        $existingAccess = $accessQuery->fetch();

        if ($existingAccess && empty($checkoutItem['allow_repeat_purchase'])) {
            $accessOrderId = clean_text($existingAccess['order_id'] ?? '', 180);
            send_json(200, [
                'ok' => true,
                'alreadyHasAccess' => true,
                'accessUrl' => $accessOrderId !== '' ? commerce_public_product_access_url($accessOrderId) : '',
                'message' => 'Akses produk digital sudah aktif.',
            ]);
        }
    }

    commerce_assert_product_stock_available($checkoutItem);
    $orderPayload = array_merge($orderPayload, [
        'product_id' => $checkoutItem['id'],
        'product_title' => $checkoutItem['title'],
        'product_type' => clean_text($checkoutItem['product_type'] ?? 'digital', 40),
        'delivery_url' => $checkoutItem['file_url'] ?? '',
        'delivery_note' => $checkoutItem['delivery_note'] ?? '',
    ]);
} else {
    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
    $classQuery->execute([$classId, 'Aktif']);
    $checkoutItem = $classQuery->fetch();

    if (!$checkoutItem) {
        send_json(404, ['message' => 'Kelas aktif tidak ditemukan.']);
    }

    if ($member && commerce_member_has_class_access($member, $classId)) {
        send_json(200, [
            'ok' => true,
            'alreadyHasAccess' => true,
            'message' => 'Akses kelas sudah aktif.',
        ]);
    }

    $orderPayload['class_id'] = $checkoutItem['id'];
    $orderPayload['class_title'] = $checkoutItem['title'];
}

$amountIdr = $checkoutType === 'digital_product'
    ? commerce_product_effective_price($checkoutItem)
    : ($checkoutType === 'bundle'
        ? max(0, (int) ($checkoutItem['price'] ?? 0))
        : commerce_class_effective_price($checkoutItem));

if ($amountIdr <= 0) {
    send_json(422, ['message' => 'Item gratis tidak perlu dibayar menggunakan PayPal.']);
}

$currency = strtoupper(paypal_config_value($config, 'paypal_currency', 10) ?: 'USD');
$exchangeRate = (float) ($config['paypal_idr_per_usd'] ?? 0);
$currencyValue = paypal_currency_value($amountIdr, $exchangeRate);

try {
    $merchantRef = 'PAYPAL-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
} catch (Throwable $error) {
    $merchantRef = 'PAYPAL-' . date('YmdHis') . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 6));
}

$localOrderId = make_id('paypal');
$returnUrl = clean_external_url($config['paypal_return_url'] ?? '')
    ?: paypal_absolute_url('/api/paypal-return.php');
$cancelUrl = clean_external_url($config['paypal_cancel_url'] ?? '')
    ?: paypal_absolute_url('/?payment=cancelled');

if ($returnUrl === '' || $cancelUrl === '') {
    send_json(500, ['message' => 'URL return atau cancel PayPal belum bisa dibuat.']);
}

$insert = $pdo->prepare(
    'INSERT INTO paypal_orders
    (id, merchant_ref, paypal_order_id, capture_id, member_id, buyer_name, buyer_email, buyer_phone,
     item_type, item_id, item_title, amount_idr, currency, currency_value, exchange_rate,
     status, approval_url, access_granted, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
$insert->execute([
    $localOrderId,
    $merchantRef,
    null,
    '',
    $member['id'] ?? '',
    $buyerName,
    $buyerEmail,
    $buyerPhone,
    $checkoutType,
    $checkoutType === 'bundle' ? $bundleProgramId : ($checkoutType === 'digital_product' ? $productId : $classId),
    clean_text($checkoutItem['title'] ?? 'IbnuCreative', 180),
    $amountIdr,
    $currency,
    $currencyValue,
    $exchangeRate,
    'creating',
    '',
    0,
    json_encode($orderPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
]);

$paypalPayload = [
    'intent' => 'CAPTURE',
    'purchase_units' => [[
        'reference_id' => $localOrderId,
        'custom_id' => $merchantRef,
        'invoice_id' => $merchantRef,
        'description' => clean_text($checkoutItem['title'] ?? 'IbnuCreative', 127),
        'amount' => [
            'currency_code' => $currency,
            'value' => $currencyValue,
            'breakdown' => [
                'item_total' => [
                    'currency_code' => $currency,
                    'value' => $currencyValue,
                ],
            ],
        ],
        'items' => [[
            'name' => clean_text($checkoutItem['title'] ?? 'IbnuCreative', 127),
            'quantity' => '1',
            'category' => 'DIGITAL_GOODS',
            'unit_amount' => [
                'currency_code' => $currency,
                'value' => $currencyValue,
            ],
        ]],
    ]],
    'payment_source' => [
        'paypal' => [
            'experience_context' => [
                'brand_name' => paypal_config_value($config, 'paypal_brand_name', 127) ?: 'IbnuCreative',
                'locale' => 'en-US',
                'shipping_preference' => 'NO_SHIPPING',
                'user_action' => 'PAY_NOW',
                'return_url' => $returnUrl,
                'cancel_url' => $cancelUrl,
            ],
        ],
    ],
];

$paypalResult = paypal_api_request(
    $config,
    'POST',
    '/v2/checkout/orders',
    $paypalPayload,
    $merchantRef . '-create',
);

if (empty($paypalResult['ok'])) {
    $updateFailed = $pdo->prepare('UPDATE paypal_orders SET status = ?, payload = ? WHERE id = ?');
    $updateFailed->execute([
        'failed',
        json_encode(array_merge($orderPayload, ['create_error' => $paypalResult['data'] ?? []]), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $localOrderId,
    ]);

    send_json(502, [
        'message' => paypal_api_error_message($paypalResult, 'Order PayPal gagal dibuat.'),
    ]);
}

$paypalData = $paypalResult['data'];
$paypalOrderId = clean_text($paypalData['id'] ?? '', 180);
$approvalUrl = paypal_approval_url($paypalData);

if ($paypalOrderId === '' || $approvalUrl === '') {
    send_json(502, ['message' => 'PayPal tidak mengembalikan Order ID atau URL persetujuan.']);
}

$savedPayload = array_merge($orderPayload, [
    'paypal_create' => $paypalData,
    'return_url' => $returnUrl,
    'cancel_url' => $cancelUrl,
]);
$update = $pdo->prepare(
    'UPDATE paypal_orders SET paypal_order_id = ?, status = ?, approval_url = ?, payload = ? WHERE id = ?',
);
$update->execute([
    $paypalOrderId,
    strtolower(clean_text($paypalData['status'] ?? 'created', 40)),
    $approvalUrl,
    json_encode($savedPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    $localOrderId,
]);

$emailResult = send_tripay_payment_email([
    'buyerName' => $buyerName,
    'buyerEmail' => $buyerEmail,
    'itemTitle' => clean_text($checkoutItem['title'] ?? 'IbnuCreative', 160),
    'amount' => $amountIdr,
    'totalAmount' => $amountIdr,
    'paymentMethod' => 'PayPal ' . $currency . ' ' . $currencyValue,
    'checkoutUrl' => $approvalUrl,
]);

send_json(200, [
    'ok' => true,
    'checkoutUrl' => $approvalUrl,
    'merchantRef' => $merchantRef,
    'reference' => $paypalOrderId,
    'paypalOrderId' => $paypalOrderId,
    'paymentMethod' => 'PAYPAL',
    'amountIdr' => $amountIdr,
    'currency' => $currency,
    'currencyValue' => $currencyValue,
    'exchangeRate' => $exchangeRate,
    'emailSent' => $emailResult['sent'] ?? false,
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    'message' => 'Checkout PayPal berhasil dibuat. Lanjutkan persetujuan pembayaran.',
]);
