<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);

$user = require_user();
$pdo = db();
$config = api_config();

function payment_order_payload(array $row): array
{
    $payload = json_decode((string) ($row['payload'] ?? '{}'), true);

    return is_array($payload) ? $payload : [];
}

function payment_payload_value(array $payload, array $paths)
{
    foreach ($paths as $path) {
        $current = $payload;

        foreach (explode('.', $path) as $segment) {
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                $current = null;
                break;
            }

            $current = $current[$segment];
        }

        if (is_scalar($current) && trim((string) $current) !== '') {
            return $current;
        }
    }

    return null;
}

function payment_amount_from_payload(array $payload): int
{
    $value = payment_payload_value($payload, [
        'amount',
        'total',
        'total_amount',
        'paid_amount',
        'gross_amount',
        'price',
        'nominal',
        'order.amount',
        'order.total',
        'order.total_amount',
        'invoice.amount',
        'invoice.total',
        'payment.amount',
        'payment.total',
        'transaction.amount',
        'transaction.total',
        'data.amount',
        'data.total',
        'data.total_amount',
        'data.paid_amount',
        'data.gross_amount',
        'data.price',
        'data.order.amount',
        'data.order.total',
        'data.order.total_amount',
        'data.invoice.amount',
        'data.invoice.total',
        'data.payment.amount',
        'data.payment.total',
        'data.transaction.amount',
        'data.transaction.total',
    ]);

    if ($value === null) {
        return 0;
    }

    if (is_numeric($value)) {
        return max(0, (int) round((float) $value));
    }

    $normalized = preg_replace('/[^0-9]/', '', (string) $value) ?? '';

    return $normalized === '' ? 0 : (int) $normalized;
}

function payment_time_value($value): int
{
    if (is_numeric($value)) {
        $number = (int) $value;

        if ($number > 1000000000000) {
            return (int) floor($number / 1000);
        }

        return $number > 1000000000 ? $number : 0;
    }

    $time = strtotime((string) $value);

    return $time ?: 0;
}

function payment_tripay_expires_at(array $row, array $payload, int $defaultMinutes): int
{
    $value = payment_payload_value($payload, [
        'expired_time',
        'expires_at',
        'expired_at',
        'data.expired_time',
        'data.expires_at',
        'data.expired_at',
        'response.expired_time',
        'response.expires_at',
        'response.expired_at',
        'response.data.expired_time',
        'response.data.expires_at',
        'response.data.expired_at',
    ]);
    $expiresAt = payment_time_value($value);

    if ($expiresAt > 0) {
        return $expiresAt;
    }

    $createdAt = payment_time_value($row['created_at'] ?? '');

    return $createdAt > 0 ? $createdAt + ($defaultMinutes * 60) : 0;
}

function payment_is_pending_status(string $status): bool
{
    return in_array(strtolower($status), ['pending', 'unpaid', 'waiting', 'callback'], true);
}

function payment_class_amount(array $class): int
{
    $salePrice = (int) ($class['sale_price'] ?? 0);
    $price = (int) ($class['price'] ?? 0);

    return $salePrice > 0 ? $salePrice : max(0, $price);
}

function payment_product_amount(array $product): int
{
    $salePrice = (int) ($product['sale_price'] ?? 0);
    $price = (int) ($product['price'] ?? 0);

    return $salePrice > 0 ? $salePrice : max(0, $price);
}

function payment_snapshot_created_at(array $row): string
{
    foreach (['created_at', 'joined_at', 'updated_at'] as $key) {
        $value = trim((string) ($row[$key] ?? ''));

        if ($value === '' || strpos($value, '0000-00-00') === 0) {
            continue;
        }

        $time = strtotime($value);

        if ($time) {
            return date('Y-m-d H:i:s', $time);
        }
    }

    return date('Y-m-d H:i:s');
}

function payment_pair_key(string $memberId, string $classId): string
{
    return $memberId . '::' . $classId;
}

function payment_product_pair_key(string $memberId, string $email, string $productId): string
{
    $buyerKey = $memberId !== '' ? $memberId : strtolower($email);

    return $buyerKey . '::' . $productId;
}

function payment_collect_existing_pairs(PDO $pdo): array
{
    $pairs = [];

    try {
        foreach ($pdo->query("SELECT member_id, class_id FROM payment_snapshots WHERE member_id <> '' AND class_id <> ''")->fetchAll() as $row) {
            $pairs[payment_pair_key((string) $row['member_id'], (string) $row['class_id'])] = true;
        }
    } catch (Throwable $error) {
        // Table may not exist on older installs.
    }

    try {
        foreach ($pdo->query("SELECT member_id, class_id FROM tripay_orders WHERE member_id <> '' AND class_id <> '' AND class_id NOT LIKE 'product:%' AND (access_granted = 1 OR status IN ('paid', 'processed', 'success', 'settlement'))")->fetchAll() as $row) {
            $pairs[payment_pair_key((string) $row['member_id'], (string) $row['class_id'])] = true;
        }
    } catch (Throwable $error) {
        // Continue.
    }

    try {
        foreach ($pdo->query("SELECT member_id, class_ids FROM lynk_orders WHERE member_id <> '' AND status = 'processed'")->fetchAll() as $row) {
            $classIds = json_decode((string) ($row['class_ids'] ?? '[]'), true);

            if (!is_array($classIds)) {
                continue;
            }

            foreach ($classIds as $classId) {
                $classId = clean_text($classId, 120);

                if ($classId !== '') {
                    $pairs[payment_pair_key((string) $row['member_id'], $classId)] = true;
                }
            }
        }
    } catch (Throwable $error) {
        // Continue.
    }

    return $pairs;
}

function payment_collect_existing_product_pairs(PDO $pdo): array
{
    $pairs = [];

    try {
        foreach ($pdo->query("SELECT member_id, buyer_email, product_id FROM payment_snapshots WHERE product_id <> ''")->fetchAll() as $row) {
            $productId = clean_text($row['product_id'] ?? '', 120);

            if ($productId !== '') {
                $pairs[payment_product_pair_key(
                    clean_text($row['member_id'] ?? '', 120),
                    clean_email($row['buyer_email'] ?? ''),
                    $productId,
                )] = true;
            }
        }
    } catch (Throwable $error) {
        // Table may not exist on older installs.
    }

    try {
        foreach ($pdo->query("SELECT member_id, buyer_email, class_id, status, access_granted FROM tripay_orders WHERE class_id LIKE 'product:%'")->fetchAll() as $row) {
            $status = strtolower(clean_text($row['status'] ?? '', 40));

            if (empty($row['access_granted']) && !in_array($status, ['paid', 'processed', 'success', 'settlement'], true)) {
                continue;
            }

            $productId = clean_text(substr((string) ($row['class_id'] ?? ''), 8), 120);

            if ($productId !== '') {
                $pairs[payment_product_pair_key(
                    clean_text($row['member_id'] ?? '', 120),
                    clean_email($row['buyer_email'] ?? ''),
                    $productId,
                )] = true;
            }
        }
    } catch (Throwable $error) {
        // Continue.
    }

    return $pairs;
}

function payment_backfill_member_access_snapshots(PDO $pdo): void
{
    try {
        $classes = [];
        $classRows = [];

        try {
            $classRows = $pdo->query('SELECT id, title, price, sale_price FROM classes')->fetchAll();
        } catch (Throwable $error) {
            $classRows = $pdo->query('SELECT id, title, price FROM classes')->fetchAll();
        }

        foreach ($classRows as $class) {
            if (!array_key_exists('sale_price', $class)) {
                $class['sale_price'] = 0;
            }

            $classes[(string) $class['id']] = $class;
        }

        if (!$classes) {
            return;
        }

        $existingPairs = payment_collect_existing_pairs($pdo);
        $members = $pdo
            ->query("SELECT id, name, email, allowed_class_ids, joined_at, created_at, updated_at FROM accounts WHERE role = 'member'")
            ->fetchAll();
        $insert = $pdo->prepare(
            'INSERT IGNORE INTO payment_snapshots
            (id, source, source_label, order_code, buyer_name, buyer_email, member_id, class_id, class_title, item_type, amount, status, payment_method, access_granted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );

        foreach ($members as $member) {
            $memberId = clean_text($member['id'] ?? '', 120);
            $classIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);

            if ($memberId === '' || !is_array($classIds) || !$classIds) {
                continue;
            }

            foreach ($classIds as $classId) {
                $classId = clean_text($classId, 120);

                if ($classId === '' || empty($classes[$classId])) {
                    continue;
                }

                $pairKey = payment_pair_key($memberId, $classId);

                if (!empty($existingPairs[$pairKey])) {
                    continue;
                }

                $class = $classes[$classId];
                $snapshotId = 'legacy-lynk-' . substr(hash('sha256', $pairKey), 0, 40);
                $orderCode = 'LYNK-LEGACY-' . strtoupper(substr(hash('sha256', $pairKey), 0, 10));

                $insert->execute([
                    $snapshotId,
                    'legacy_lynk_access',
                    'Akses lama / Lynk.id',
                    $orderCode,
                    clean_text($member['name'] ?? 'Member', 160),
                    clean_email($member['email'] ?? ''),
                    $memberId,
                    $classId,
                    clean_text($class['title'] ?? 'Kelas', 180),
                    'class',
                    payment_class_amount($class),
                    'paid',
                    'Lynk.id',
                    1,
                    payment_snapshot_created_at($member),
                ]);
                $existingPairs[$pairKey] = true;
            }
        }
    } catch (Throwable $error) {
        // Payment list should still load even if legacy backfill is blocked.
    }
}

function payment_backfill_product_access_snapshots(PDO $pdo): void
{
    try {
        $products = [];
        $productRows = [];

        try {
            $productRows = $pdo->query('SELECT id, title, price, sale_price FROM digital_products')->fetchAll();
        } catch (Throwable $error) {
            $productRows = $pdo->query('SELECT id, title, price FROM digital_products')->fetchAll();
        }

        foreach ($productRows as $product) {
            if (!array_key_exists('sale_price', $product)) {
                $product['sale_price'] = 0;
            }

            $products[(string) $product['id']] = $product;
        }

        if (!$products) {
            return;
        }

        $existingPairs = payment_collect_existing_product_pairs($pdo);
        $accessRows = $pdo
            ->query("SELECT * FROM digital_product_access WHERE status = 'active' ORDER BY created_at ASC")
            ->fetchAll();
        $insert = $pdo->prepare(
            'INSERT IGNORE INTO payment_snapshots
            (id, source, source_label, order_code, buyer_name, buyer_email, member_id, product_id, product_title, item_type, amount, status, payment_method, access_granted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );

        foreach ($accessRows as $access) {
            $productId = clean_text($access['product_id'] ?? '', 120);

            if ($productId === '' || empty($products[$productId])) {
                continue;
            }

            $memberId = clean_text($access['member_id'] ?? '', 120);
            $buyerEmail = clean_email($access['buyer_email'] ?? '');
            $pairKey = payment_product_pair_key($memberId, $buyerEmail, $productId);

            if (!empty($existingPairs[$pairKey])) {
                continue;
            }

            $product = $products[$productId];
            $source = strtolower(clean_text($access['source'] ?? '', 80));
            $isLynk = strpos($source, 'lynk') !== false;
            $snapshotId = 'legacy-product-' . substr(hash('sha256', $pairKey), 0, 40);
            $fallbackOrderCode = ($isLynk ? 'LYNK-PRODUCT-' : 'PRODUCT-ACCESS-')
                . strtoupper(substr(hash('sha256', $pairKey), 0, 10));

            $insert->execute([
                $snapshotId,
                $isLynk ? 'legacy_lynk_product_access' : 'legacy_product_access',
                $isLynk ? 'Akses produk / Lynk.id' : 'Akses produk digital',
                clean_text($access['order_id'] ?? '', 180) ?: $fallbackOrderCode,
                clean_text($access['buyer_name'] ?? 'Pelanggan', 160),
                $buyerEmail,
                $memberId,
                $productId,
                clean_text($access['product_title'] ?? ($product['title'] ?? 'Produk digital'), 180),
                'digital_product',
                payment_product_amount($product),
                'paid',
                $isLynk ? 'Lynk.id' : clean_text($access['source'] ?? 'Produk digital', 80),
                1,
                payment_snapshot_created_at($access),
            ]);
            $existingPairs[$pairKey] = true;
        }
    } catch (Throwable $error) {
        // Payment list should still load even if legacy product backfill is blocked.
    }
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
    $expiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
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
        $expiresAt = payment_tripay_expires_at($row, $payload, $expiredMinutes);
        $status = strtolower(clean_text($row['status'] ?? 'pending', 40));
        $isExpired = payment_is_pending_status($status)
            && empty($row['access_granted'])
            && $expiresAt > 0
            && $expiresAt <= time();

        if ($isExpired) {
            $row['status'] = 'expired';

            try {
                $markExpired = $pdo->prepare(
                    "UPDATE tripay_orders SET status = ? WHERE id = ? AND status IN ('pending', 'unpaid', 'waiting', 'callback')",
                );
                $markExpired->execute(['expired', $row['id']]);
            } catch (Throwable $error) {
                // The public response can still mark it expired even if DB update is blocked.
            }
        }

        $payments[] = payment_public(array_merge($row, [
            'source' => 'tripay',
            'sourceLabel' => 'Tripay',
            'orderCode' => $row['merchant_ref'] ?: $row['reference'],
            'itemType' => $isProduct ? 'digital_product' : 'class',
            'productId' => $isProduct ? clean_text($payload['product_id'] ?? '', 120) : '',
            'productTitle' => $isProduct ? clean_text($payload['product_title'] ?? $row['class_title'], 180) : '',
            'paymentMethod' => clean_text($payload['payment_name'] ?? $payload['payment_method'] ?? 'Tripay', 120),
            'accessGranted' => !empty($row['access_granted']),
            'expiresAt' => $expiresAt > 0 ? date('Y-m-d H:i:s', $expiresAt) : '',
            'isExpired' => $isExpired,
        ]));
    }
} catch (Throwable $error) {
    // Continue with other sources.
}

if (($user['role'] ?? '') === 'admin') {
    payment_backfill_member_access_snapshots($pdo);
    payment_backfill_product_access_snapshots($pdo);
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
            if (($row['status'] ?? '') === 'product_processed') {
                continue;
            }

            $classIds = json_decode((string) ($row['class_ids'] ?? '[]'), true);
            $payload = payment_order_payload($row);
            $amount = payment_amount_from_payload($payload);
            $payloadProductName = payment_payload_value($payload, [
                'product.name',
                'product.title',
                'item.name',
                'item.title',
                'order.product_name',
                'order.item_name',
                'data.product.name',
                'data.product.title',
                'data.item.name',
                'data.item.title',
                'data.product_name',
                'data.item_name',
                'product_name',
                'item_name',
                'title',
                'name',
            ]);
            $productName = clean_text($payloadProductName ?: ($row['product_name'] ?: 'Pembayaran Lynk.id'), 180);
            $payments[] = payment_public(array_merge($row, [
                'id' => 'lynk:' . $row['id'],
                'source' => 'lynk',
                'sourceLabel' => 'Lynk.id',
                'orderCode' => $row['order_id'],
                'classId' => is_array($classIds) ? clean_text($classIds[0] ?? '', 120) : '',
                'classTitle' => $productName,
                'amount' => $amount,
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
