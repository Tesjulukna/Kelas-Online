<?php
declare(strict_types=1);

function automatic_account_assign(PDO $pdo, array $product, string $orderId, string $buyerEmail, string $buyerName): void
{
    if (!$pdo->inTransaction() || $orderId === '' || $buyerEmail === '' || trim($buyerName) === '') throw new RuntimeException('Nama, email, dan ID pesanan diperlukan untuk membuat token.');
    $lock = $pdo->prepare('SELECT * FROM digital_products WHERE id = ? FOR UPDATE');
    $lock->execute([$product['id']]);
    $product = $lock->fetch();
    if (!$product || ($product['product_type'] ?? '') !== 'auto_account') throw new RuntimeException('Produk akun otomatis tidak ditemukan.');
    $query = $pdo->prepare('SELECT product_id FROM product_account_stock WHERE order_id = ? FOR UPDATE');
    $query->execute([$orderId]);
    $existingProductId = $query->fetchColumn();
    if ($existingProductId) {
        if ($existingProductId !== $product['id']) throw new RuntimeException('ID pesanan sudah terkait produk lain.');
        return;
    }
    $sourceQuery = $pdo->prepare('SELECT * FROM account_product_sources WHERE product_id = ?');
    $sourceQuery->execute([$product['id']]);
    $source = $sourceQuery->fetch();
    if (!$source) throw new RuntimeException('Tab token produk belum dikonfigurasi.');
    $days = max(0, min(3650, (int) ($product['account_token_days'] ?? 0)));
    $credentials = [
        'kind' => 'token', 'username' => $buyerName, 'token' => bin2hex(random_bytes(32)),
        'createdAt' => gmdate('Y-m-d\TH:i:s\Z'), 'expiresAt' => $days ? gmdate('Y-m-d\TH:i:s\Z', time() + $days * 86400) : '',
        'spreadsheetId' => $source['spreadsheet_id'], 'tab' => $source['sheet_tab'],
        'productUrl' => clean_asset_url($product['file_url'] ?? '', 1000), 'fileName' => $product['file_name'] ?? '',
    ];
    $identity = hash('sha256', $product['id'] . '|' . $orderId);
    $insert = $pdo->prepare("INSERT INTO product_account_stock (product_id, source_key, username_key, account_id, credentials, status, order_id, buyer_email, product_title, delivery_note, delivery_url, sold_at)
        VALUES (?, ?, ?, ?, ?, 'sold', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
    $insert->execute([$product['id'], $identity, $identity, 'auto-' . substr($identity, 0, 40), account_stock_encrypt($credentials),
        $orderId, $buyerEmail, $product['title'], $product['delivery_note'] ?? '', commerce_public_product_access_url($orderId, 'auto_account')]);
}

function automatic_account_register(PDO $pdo, array $row): void
{
    $credentials = account_stock_decrypt($row['credentials']);
    $result = account_gas_request('register_token', $credentials['spreadsheetId'], [
        'tab' => $credentials['tab'], 'accountId' => $row['account_id'], 'name' => $credentials['username'],
        'token' => $credentials['token'], 'orderId' => $row['order_id'], 'buyerEmail' => $row['buyer_email'],
        'createdAt' => $credentials['createdAt'], 'expiresAt' => $credentials['expiresAt'],
    ]);
    if (($result['updated'] ?? false) !== true) throw new RuntimeException('GAS belum mengonfirmasi pembuatan token.');
    $update = $pdo->prepare('UPDATE product_account_stock SET sheet_synced = 1 WHERE id = ?');
    $update->execute([$row['id']]);
}
