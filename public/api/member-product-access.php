<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_digital-products-common.php';

ensure_method(['PUT']);

$pdo = db();
$user = require_user('admin');
$payload = read_json_body();
$memberId = clean_text($payload['memberId'] ?? '', 120);

if ($memberId === '') {
    send_json(400, ['message' => 'Member untuk pemberian akses tidak ditemukan.']);
}

ensure_digital_products_schema($pdo);

$memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
$memberQuery->execute([$memberId, 'member']);
$member = $memberQuery->fetch();

if (!$member) {
    send_json(404, ['message' => 'Member tidak ditemukan.']);
}

$requestedProductIds = is_array($payload['productIds'] ?? null)
    ? array_slice($payload['productIds'], 0, 300)
    : [];
$requestedProductIds = array_values(array_unique(array_filter(array_map(static function ($productId): string {
    return clean_text($productId, 120);
}, $requestedProductIds))));
$productsById = [];

if ($requestedProductIds) {
    $placeholders = implode(',', array_fill(0, count($requestedProductIds), '?'));
    $productQuery = $pdo->prepare(
        "SELECT id, title, file_url FROM digital_products WHERE id IN ({$placeholders})",
    );
    $productQuery->execute($requestedProductIds);

    foreach ($productQuery->fetchAll() as $product) {
        $productsById[$product['id']] = $product;
    }
}

$selectedProductIds = array_values(array_filter($requestedProductIds, static function ($productId) use ($productsById): bool {
    return isset($productsById[$productId]);
}));
$selectedProductMap = array_fill_keys($selectedProductIds, true);
$memberEmail = clean_email($member['email'] ?? '');

if ($memberEmail !== '') {
    $accessQuery = $pdo->prepare(
        'SELECT * FROM digital_product_access WHERE member_id = ? OR buyer_email = ? ORDER BY created_at ASC',
    );
    $accessQuery->execute([$memberId, $memberEmail]);
} else {
    $accessQuery = $pdo->prepare(
        'SELECT * FROM digital_product_access WHERE member_id = ? ORDER BY created_at ASC',
    );
    $accessQuery->execute([$memberId]);
}

$accessRows = $accessQuery->fetchAll();
$manualRowsByProduct = [];
$protectedProductMap = [];

try {
    $pdo->beginTransaction();

    $attachAccess = $pdo->prepare(
        'UPDATE digital_product_access SET member_id = ? WHERE id = ? AND member_id = ?',
    );

    foreach ($accessRows as $index => $access) {
        if (empty($access['member_id']) && $memberEmail !== '' && clean_email($access['buyer_email'] ?? '') === $memberEmail) {
            $attachAccess->execute([$memberId, $access['id'], '']);
            $accessRows[$index]['member_id'] = $memberId;
        }

        $productId = clean_text($access['product_id'] ?? '', 120);
        $source = strtolower(clean_text($access['source'] ?? '', 80));
        $status = strtolower(clean_text($access['status'] ?? 'active', 40));

        if ($productId === '') {
            continue;
        }

        if ($source === 'admin-manual') {
            if (!isset($manualRowsByProduct[$productId])) {
                $manualRowsByProduct[$productId] = [];
            }

            $manualRowsByProduct[$productId][] = $accessRows[$index];
        } elseif ($status === 'active') {
            $protectedProductMap[$productId] = true;
        }
    }

    $updateManualAccess = $pdo->prepare(
        'UPDATE digital_product_access
        SET product_title = ?, member_id = ?, buyer_name = ?, buyer_email = ?, order_id = ?, status = ?, download_url = ?
        WHERE id = ?',
    );

    foreach ($manualRowsByProduct as $productId => $manualRows) {
        $product = $productsById[$productId] ?? null;
        $keepManualAccess = $product && isset($selectedProductMap[$productId]) && !isset($protectedProductMap[$productId]);

        foreach ($manualRows as $rowIndex => $manualAccess) {
            $isActive = $keepManualAccess && $rowIndex === 0;
            $orderId = clean_text($manualAccess['order_id'] ?? '', 180)
                ?: 'admin-' . clean_text($manualAccess['id'] ?? make_id('access'), 150);

            $updateManualAccess->execute([
                clean_text($product['title'] ?? ($manualAccess['product_title'] ?? 'Produk digital'), 180),
                $memberId,
                clean_text($member['name'] ?? $member['username'] ?? 'Member', 160),
                $memberEmail,
                $orderId,
                $isActive ? 'active' : 'revoked',
                clean_asset_url($product['file_url'] ?? ($manualAccess['download_url'] ?? ''), 1000),
                $manualAccess['id'],
            ]);
        }
    }

    $insertAccess = $pdo->prepare(
        'INSERT INTO digital_product_access
        (id, product_id, product_title, member_id, buyer_name, buyer_email, source, order_id, status, download_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );

    foreach ($selectedProductIds as $productId) {
        if (isset($protectedProductMap[$productId]) || !empty($manualRowsByProduct[$productId])) {
            continue;
        }

        $product = $productsById[$productId];
        $accessId = make_id('access');

        $insertAccess->execute([
            $accessId,
            $productId,
            clean_text($product['title'] ?? 'Produk digital', 180),
            $memberId,
            clean_text($member['name'] ?? $member['username'] ?? 'Member', 160),
            $memberEmail,
            'admin-manual',
            'admin-' . $accessId,
            'active',
            clean_asset_url($product['file_url'] ?? '', 1000),
        ]);
    }

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    send_json(500, ['message' => 'Akses produk dan prompt tidak bisa disimpan.']);
}

send_json(200, fetch_digital_products($pdo, $user));
