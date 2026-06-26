<?php

declare(strict_types=1);

function commerce_json($value): array
{
    $decoded = json_decode((string) ($value ?? '{}'), true);

    return is_array($decoded) ? $decoded : [];
}

function commerce_product_effective_price(array $product): int
{
    $salePrice = clean_number($product['sale_price'] ?? 0, 0, 1000000000);

    return $salePrice > 0
        ? $salePrice
        : clean_number($product['price'] ?? 0, 0, 1000000000);
}

function commerce_class_effective_price(array $class): int
{
    $salePrice = clean_number($class['sale_price'] ?? 0, 0, 1000000000);

    return $salePrice > 0
        ? $salePrice
        : clean_number($class['price'] ?? 0, 0, 1000000000);
}

function commerce_public_product_access_url(string $orderCode): string
{
    $code = clean_text($orderCode, 180);

    return $code !== '' ? tripay_absolute_url('/produk-akses/' . rawurlencode($code)) : '';
}

function commerce_fetch_product(PDO $pdo, string $productId, bool $activeOnly = true): ?array
{
    $sql = $activeOnly
        ? 'SELECT * FROM digital_products WHERE id = ? AND status = ? LIMIT 1'
        : 'SELECT * FROM digital_products WHERE id = ? LIMIT 1';
    $query = $pdo->prepare($sql);
    $activeOnly ? $query->execute([$productId, 'Aktif']) : $query->execute([$productId]);
    $product = $query->fetch();

    return $product ?: null;
}

function commerce_grant_digital_product_access(PDO $pdo, array $args): array
{
    $productId = clean_text($args['productId'] ?? '', 120);
    $product = commerce_fetch_product($pdo, $productId, false);

    if (!$product) {
        send_json(404, ['message' => 'Produk digital tidak ditemukan.']);
    }

    $memberId = clean_text($args['memberId'] ?? '', 120);
    $buyerEmail = clean_email($args['buyerEmail'] ?? '');
    $orderId = clean_text($args['orderId'] ?? '', 180);

    $existing = null;

    if ($orderId !== '') {
        $query = $pdo->prepare('SELECT * FROM digital_product_access WHERE order_id = ? LIMIT 1');
        $query->execute([$orderId]);
        $existing = $query->fetch();
    }

    if (!$existing && ($memberId !== '' || $buyerEmail !== '')) {
        $query = $pdo->prepare(
            'SELECT * FROM digital_product_access
            WHERE product_id = ? AND (member_id = ? OR buyer_email = ?)
            LIMIT 1',
        );
        $query->execute([$productId, $memberId, $buyerEmail]);
        $existing = $query->fetch();
    }

    if ($existing) {
        return [
            'granted' => false,
            'access' => $existing,
            'product' => $product,
        ];
    }

    $accessId = make_id('access');
    $insert = $pdo->prepare(
        'INSERT INTO digital_product_access
        (id, product_id, product_title, member_id, buyer_name, buyer_email, source, order_id, status, download_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insert->execute([
        $accessId,
        $product['id'],
        $product['title'],
        $memberId,
        clean_text($args['buyerName'] ?? 'Pelanggan', 160),
        $buyerEmail,
        clean_text($args['source'] ?? 'checkout', 80),
        $orderId,
        'active',
        clean_asset_url($product['file_url'] ?? '', 1000),
    ]);

    $query = $pdo->prepare('SELECT * FROM digital_product_access WHERE id = ? LIMIT 1');
    $query->execute([$accessId]);

    return [
        'granted' => true,
        'access' => $query->fetch(),
        'product' => $product,
    ];
}

