<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';

ensure_method(['POST']);

$pdo = db();
$config = api_config();
$rawBody = file_get_contents('php://input') ?: '';
$payload = json_decode($rawBody, true);

if (!is_array($payload)) {
    send_json(400, ['message' => 'Payload webhook Tripay tidak valid.']);
}

tripay_assert_config($config);
tripay_ensure_schema($pdo);

$privateKey = tripay_config_value($config, 'tripay_private_key', 300);
$signature = clean_text($_SERVER['HTTP_X_CALLBACK_SIGNATURE'] ?? '', 300);
$signature = $signature ?: clean_text($_SERVER['HTTP_X_TRIPAY_SIGNATURE'] ?? '', 300);
$signature = $signature ?: clean_text($_SERVER['HTTP_X_SIGNATURE'] ?? '', 300);
$expectedSignature = tripay_callback_signature($rawBody, $privateKey);

if ($signature === '' || !hash_equals($expectedSignature, preg_replace('/^sha256=/i', '', $signature) ?? '')) {
    send_json(401, ['message' => 'Signature webhook Tripay tidak valid.']);
}

$event = strtolower(clean_text($_SERVER['HTTP_X_CALLBACK_EVENT'] ?? '', 80));

if ($event !== '' && $event !== 'payment_status') {
    send_json(200, [
        'ok' => true,
        'ignored' => true,
        'message' => 'Event Tripay diterima tetapi bukan payment_status.',
    ]);
}

$data = is_array($payload['data'] ?? null) ? $payload['data'] : $payload;
$merchantRef = tripay_first_value($data, ['merchant_ref', 'merchantRef']);
$reference = tripay_first_value($data, ['reference']);
$status = strtolower(tripay_first_value($data, ['status']) ?: 'callback');

if ($merchantRef === '' && $reference === '') {
    send_json(422, ['message' => 'Merchant reference Tripay tidak ditemukan.']);
}

$order = null;

if ($merchantRef !== '') {
    $orderQuery = $pdo->prepare('SELECT * FROM tripay_orders WHERE merchant_ref = ? LIMIT 1');
    $orderQuery->execute([$merchantRef]);
    $order = $orderQuery->fetch();
}

if (!$order && $reference !== '') {
    $orderQuery = $pdo->prepare('SELECT * FROM tripay_orders WHERE reference = ? LIMIT 1');
    $orderQuery->execute([$reference]);
    $order = $orderQuery->fetch();
}

if (!$order) {
    send_json(200, [
        'ok' => true,
        'ignored' => true,
        'message' => 'Order Tripay tidak ditemukan di website.',
        'merchantRef' => $merchantRef,
        'reference' => $reference,
    ]);
}

if (!tripay_is_paid($data)) {
    $update = $pdo->prepare(
        'UPDATE tripay_orders SET reference = ?, status = ?, payload = ? WHERE id = ?',
    );
    $update->execute([
        $reference ?: ($order['reference'] ?? ''),
        $status,
        $rawBody,
        $order['id'],
    ]);

    send_json(200, [
        'ok' => true,
        'ignored' => true,
        'status' => $status,
        'message' => 'Webhook Tripay diterima, tetapi pembayaran belum sukses.',
    ]);
}

$paidAmount = clean_number(
    tripay_first_value($data, ['amount', 'total_amount', 'data.amount', 'data.total_amount']),
    0,
    1000000000,
);

if ($paidAmount > 0 && $paidAmount < (int) ($order['amount'] ?? 0)) {
    send_json(422, ['message' => 'Nominal pembayaran Tripay lebih kecil dari harga order.']);
}

if (in_array($order['status'] ?? '', ['processed', 'paid'], true)) {
    send_json(200, [
        'ok' => true,
        'duplicate' => true,
        'message' => 'Order Tripay sudah pernah diproses.',
    ]);
}

$orderPayload = commerce_json($order['payload'] ?? '{}');
$isDigitalProductOrder = clean_text($orderPayload['order_type'] ?? '', 60) === 'digital_product';
$isPublicClassOrder = clean_text($orderPayload['order_type'] ?? '', 60) === 'public_class';

if ($isDigitalProductOrder) {
    $productId = clean_text($orderPayload['product_id'] ?? '', 120);
    $accountResult = empty($order['member_id'])
        ? commerce_grant_product_member_account($pdo, [
            'productId' => $productId,
            'buyerName' => $order['buyer_name'] ?? 'Pelanggan',
            'buyerEmail' => $order['buyer_email'] ?? '',
            'buyerPhone' => $orderPayload['buyer_phone'] ?? '',
        ], $config)
        : [
            'enabled' => false,
            'member' => null,
            'password' => null,
            'loginUrl' => commerce_login_url($config),
        ];
    $memberId = clean_text(($order['member_id'] ?? '') ?: ($accountResult['member']['id'] ?? ''), 120);
    $accessResult = commerce_grant_digital_product_access($pdo, [
        'productId' => $productId,
        'memberId' => $memberId,
        'buyerEmail' => $order['buyer_email'] ?? '',
        'buyerName' => $order['buyer_name'] ?? 'Pelanggan',
        'source' => 'tripay',
        'orderId' => $order['merchant_ref'] ?: ($reference ?: ($order['reference'] ?? '')),
    ]);

    $update = $pdo->prepare(
        'UPDATE tripay_orders
        SET reference = ?, member_id = ?, status = ?, access_granted = ?, payload = ?
        WHERE id = ?',
    );
    $update->execute([
        $reference ?: ($order['reference'] ?? ''),
        $memberId,
        'processed',
        $accessResult['granted'] ? 1 : 0,
        json_encode(array_merge($orderPayload, ['callback' => $payload]), JSON_UNESCAPED_UNICODE),
        $order['id'],
    ]);

    $accessUrl = !empty($orderPayload['public_checkout'])
        ? commerce_public_product_access_url(
            $order['merchant_ref'] ?: ($reference ?: ($order['reference'] ?? '')),
            clean_text($accessResult['product']['product_type'] ?? ($orderPayload['product_type'] ?? 'digital'), 40)
        )
        : clean_asset_url($accessResult['product']['file_url'] ?? '', 1000);
    $emailResult = send_digital_product_delivery_email([
        'buyerName' => clean_text($order['buyer_name'] ?? 'Pelanggan', 160),
        'buyerEmail' => clean_email($order['buyer_email'] ?? ''),
        'productTitle' => clean_text($accessResult['product']['title'] ?? $order['class_title'] ?? 'Produk digital', 180),
        'productType' => clean_text($accessResult['product']['product_type'] ?? ($orderPayload['product_type'] ?? 'digital'), 40),
        'downloadUrl' => $accessUrl,
        'deliveryNote' => clean_text($accessResult['product']['delivery_note'] ?? ($orderPayload['delivery_note'] ?? ''), 1200),
    ]);
    $accountEmailResult = !empty($accountResult['enabled'])
        ? send_product_access_credentials_email([
            'buyerName' => clean_text($order['buyer_name'] ?? 'Pelanggan', 160),
            'buyerEmail' => clean_email($order['buyer_email'] ?? ''),
            'username' => clean_text($accountResult['member']['username'] ?? '', 120),
            'password' => $accountResult['password'],
            'productTitle' => clean_text($accessResult['product']['title'] ?? $order['class_title'] ?? 'Produk digital', 180),
            'loginUrl' => $accountResult['loginUrl'],
            'accessUrl' => $accessUrl,
        ])
        : ['sent' => false, 'message' => 'Akun otomatis produk tidak aktif.'];

    send_json(200, [
        'ok' => true,
        'message' => $accessResult['granted']
            ? 'Pembayaran Tripay sukses dan produk digital sudah aktif.'
            : 'Pembayaran Tripay sukses. Pembeli sudah memiliki akses produk.',
        'merchantRef' => $order['merchant_ref'],
        'reference' => $reference ?: ($order['reference'] ?? ''),
        'productId' => $productId,
        'accessGranted' => $accessResult['granted'],
        'memberAccountCreated' => !empty($accountResult['enabled']),
        'emailSent' => $emailResult['sent'] ?? false,
        'accountEmailSent' => $accountEmailResult['sent'] ?? false,
        'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    ]);
}

if ($isPublicClassOrder) {
    $accessResult = commerce_grant_class_account_access($pdo, [
        'classId' => $order['class_id'] ?? ($orderPayload['class_id'] ?? ''),
        'buyerName' => $order['buyer_name'] ?? 'Peserta IbnuCreative',
        'buyerEmail' => $order['buyer_email'] ?? '',
        'buyerPhone' => $orderPayload['buyer_phone'] ?? '',
    ], $config);

    $update = $pdo->prepare(
        'UPDATE tripay_orders
        SET reference = ?, member_id = ?, status = ?, access_granted = ?, payload = ?
        WHERE id = ?',
    );
    $update->execute([
        $reference ?: ($order['reference'] ?? ''),
        $accessResult['member']['id'] ?? '',
        'processed',
        $accessResult['accessGranted'] ? 1 : 0,
        json_encode(array_merge($orderPayload, ['callback' => $payload]), JSON_UNESCAPED_UNICODE),
        $order['id'],
    ]);

    $emailResult = send_class_access_credentials_email([
        'buyerName' => clean_text($order['buyer_name'] ?? 'Peserta IbnuCreative', 160),
        'buyerEmail' => clean_email($order['buyer_email'] ?? ''),
        'username' => clean_text($accessResult['member']['username'] ?? '', 120),
        'password' => $accessResult['password'],
        'classTitle' => clean_text($accessResult['class']['title'] ?? ($order['class_title'] ?? 'Kelas IbnuCreative'), 180),
        'purchaseMessage' => clean_text($accessResult['class']['purchase_message'] ?? '', 2000),
        'loginUrl' => $accessResult['loginUrl'],
    ]);

    send_json(200, [
        'ok' => true,
        'message' => $accessResult['accessGranted']
            ? 'Pembayaran Tripay sukses, akun member dibuat/diperbarui, dan akses kelas sudah aktif.'
            : 'Pembayaran Tripay sukses. Member sudah memiliki akses kelas.',
        'merchantRef' => $order['merchant_ref'],
        'reference' => $reference ?: ($order['reference'] ?? ''),
        'classId' => $order['class_id'],
        'memberId' => $accessResult['member']['id'] ?? '',
        'accessGranted' => $accessResult['accessGranted'],
        'emailSent' => $emailResult['sent'] ?? false,
        'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
    ]);
}

$accessGranted = tripay_grant_class_access($pdo, $order['member_id'], $order['class_id']);
$update = $pdo->prepare(
    'UPDATE tripay_orders
    SET reference = ?, status = ?, access_granted = ?, payload = ?
    WHERE id = ?',
);
$update->execute([
    $reference ?: ($order['reference'] ?? ''),
    'processed',
    $accessGranted ? 1 : 0,
    $rawBody,
    $order['id'],
]);

$classInfo = [];
$memberInfo = [];

try {
    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
    $classQuery->execute([$order['class_id']]);
    $classInfo = $classQuery->fetch() ?: [];
} catch (Throwable $error) {
    $classInfo = [];
}

try {
    $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
    $memberQuery->execute([$order['member_id'], 'member']);
    $memberInfo = $memberQuery->fetch() ?: [];
} catch (Throwable $error) {
    $memberInfo = [];
}

$memberEmail = clean_email($order['buyer_email'] ?? ($memberInfo['email'] ?? ''));
$emailResult = $memberEmail !== ''
    ? send_class_access_credentials_email([
        'buyerName' => clean_text($order['buyer_name'] ?? ($memberInfo['name'] ?? 'Peserta IbnuCreative'), 160),
        'buyerEmail' => $memberEmail,
        'username' => clean_text($memberInfo['username'] ?? '', 120),
        'password' => '',
        'classTitle' => clean_text($classInfo['title'] ?? ($order['class_title'] ?? 'Kelas IbnuCreative'), 180),
        'purchaseMessage' => clean_text($classInfo['purchase_message'] ?? '', 2000),
        'loginUrl' => commerce_login_url($config),
    ])
    : ['sent' => false, 'message' => 'Email member tidak tersedia.'];

send_json(200, [
    'ok' => true,
    'message' => $accessGranted
        ? 'Pembayaran Tripay sukses dan akses kelas sudah aktif.'
        : 'Pembayaran Tripay sukses. Member sudah memiliki akses kelas.',
    'merchantRef' => $order['merchant_ref'],
    'reference' => $reference ?: ($order['reference'] ?? ''),
    'classId' => $order['class_id'],
    'memberId' => $order['member_id'],
    'accessGranted' => $accessGranted,
    'emailSent' => $emailResult['sent'] ?? false,
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? ''),
]);
