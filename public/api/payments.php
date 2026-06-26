<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);

$user = require_user();
$pdo = db();

function payment_order_payload(array $row): array
{
    $payload = json_decode((string) ($row['payload'] ?? '{}'), true);

    return is_array($payload) ? $payload : [];
}

function payment_public(array $row): array
{
    return [
        'id' => clean_text($row['id'] ?? make_id('payment'), 240),
        'source' => clean_text($row['source'] ?? '', 80),
        'sourceLabel' => clean_text($row['sourceLabel'] ?? ($row['source_label'] ?? 'Pembayaran'), 120),
        'orderCode' => clean_text($row['orderCode'] ?? ($row['order_code'] ?? ''), 180),
        'merchantRef' => clean_text($row['merchantRef'] ?? ($row['merchant_ref'] ?? ''), 180),
        'reference' => clean_text($row['reference'] ?? '', 180),
        'buyerName' => clean_text($row['buyerName'] ?? ($row['buyer_name'] ?? 'Member'), 160),
        'buyerEmail' => clean_email($row['buyerEmail'] ?? ($row['buyer_email'] ?? '')),
        'memberId' => clean_text($row['memberId'] ?? ($row['member_id'] ?? ''), 120),
        'classId' => clean_text($row['classId'] ?? ($row['class_id'] ?? ''), 120),
        'itemType' => clean_text($row['itemType'] ?? ($row['item_type'] ?? 'class'), 40),
        'productId' => clean_text($row['productId'] ?? ($row['product_id'] ?? ''), 120),
        'productTitle' => clean_text($row['productTitle'] ?? ($row['product_title'] ?? ''), 180),
        'classTitle' => clean_text($row['classTitle'] ?? ($row['class_title'] ?? 'Kelas'), 180),
        'amount' => (int) ($row['amount'] ?? 0),
        'status' => clean_text($row['status'] ?? 'pending', 40),
        'paymentMethod' => clean_text($row['paymentMethod'] ?? ($row['payment_method'] ?? ($row['sourceLabel'] ?? '-')), 120),
        'checkoutUrl' => clean_asset_url($row['checkoutUrl'] ?? ($row['checkout_url'] ?? ''), 1000),
        'accessGranted' => !empty($row['accessGranted']) || !empty($row['access_granted']),
        'expiresAt' => clean_text($row['expiresAt'] ?? '', 80),
        'isExpired' => !empty($row['isExpired']),
        'createdAt' => clean_text($row['createdAt'] ?? ($row['created_at'] ?? ''), 80),
        'updatedAt' => clean_text($row['updatedAt'] ?? ($row['updated_at'] ?? ''), 80),
    ];
}

$payments = [];

try {
    $query = ($user['role'] ?? '') === 'admin'
        ? $pdo->query('SELECT * FROM tripay_orders ORDER BY created_at DESC LIMIT 2000')
        : (function () use ($pdo, $user) {
            $q = $pdo->prepare('SELECT * FROM tripay_orders WHERE member_id = ? ORDER BY created_at DESC LIMIT 500');
            $q->execute([$user['userId'] ?? '']);
            return $q;
        })();

    foreach ($query->fetchAll() as $row) {
        $payload = payment_order_payload($row);
        $isProduct = clean_text($payload['order_type'] ?? '', 60) === 'digital_product';
        $payments[] = payment_public(array_merge($row, [
            'source' => 'tripay',
            'sourceLabel' => 'Tripay',
            'orderCode' => $row['merchant_ref'] ?: $row['reference'],
            'itemType' => $isProduct ? 'digital_product' : 'class',
            'productId' => $isProduct ? clean_text($payload['product_id'] ?? '', 120) : '',
            'productTitle' => $isProduct ? clean_text($payload['product_title'] ?? $row['class_title'], 180) : '',
            'paymentMethod' => clean_text($payload['payment_name'] ?? $payload['payment_method'] ?? 'Tripay', 120),
            'accessGranted' => !empty($row['access_granted']),
        ]));
    }
} catch (Throwable $error) {
    // Continue with other sources.
}

try {
    $query = ($user['role'] ?? '') === 'admin'
        ? $pdo->query('SELECT * FROM payment_snapshots ORDER BY created_at DESC LIMIT 2000')
        : (function () use ($pdo, $user) {
            $q = $pdo->prepare('SELECT * FROM payment_snapshots WHERE member_id = ? ORDER BY created_at DESC LIMIT 500');
            $q->execute([$user['userId'] ?? '']);
            return $q;
        })();

    foreach ($query->fetchAll() as $row) {
        $payments[] = payment_public($row);
    }
} catch (Throwable $error) {
    // Continue.
}

if (($user['role'] ?? '') === 'admin') {
    try {
        foreach ($pdo->query('SELECT * FROM lynk_orders ORDER BY created_at DESC LIMIT 1000')->fetchAll() as $row) {
            $classIds = json_decode((string) ($row['class_ids'] ?? '[]'), true);
            $payments[] = payment_public(array_merge($row, [
                'id' => 'lynk:' . $row['id'],
                'source' => 'lynk',
                'sourceLabel' => 'Lynk.id',
                'orderCode' => $row['order_id'],
                'classId' => is_array($classIds) ? clean_text($classIds[0] ?? '', 120) : '',
                'classTitle' => $row['product_name'] ?: 'Pembayaran Lynk.id',
                'amount' => 0,
                'paymentMethod' => 'Lynk.id',
                'accessGranted' => ($row['status'] ?? '') === 'processed',
            ]));
        }
    } catch (Throwable $error) {
        // Continue.
    }
}

usort($payments, static function (array $first, array $second): int {
    return (strtotime($second['createdAt'] ?? '') ?: 0) <=> (strtotime($first['createdAt'] ?? '') ?: 0);
});

send_json(200, [
    'payments' => array_values($payments),
    'updatedAt' => updated_at($pdo),
]);
