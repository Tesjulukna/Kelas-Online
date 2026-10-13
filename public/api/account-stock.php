<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_digital-products-common.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_email.php';

ensure_method(['POST']);
$user = require_user('admin');
$payload = read_json_body();

try {
    if (($payload['action'] ?? '') === 'tabs') {
        $id = account_sheet_id((string) ($payload['spreadsheet'] ?? ''));
        $data = account_gas_request('tabs', $id);
        $tabs = account_sheet_tabs($data);
        send_json(200, ['spreadsheetId' => $id, 'title' => $data['properties']['title'] ?? '', 'tabs' => $tabs]);
    }
    if (($payload['action'] ?? '') !== 'sync') send_json(400, ['message' => 'Aksi stok akun tidak valid.']);
    $pdo = db();
    ensure_digital_products_schema($pdo);
    $productId = clean_text($payload['productId'] ?? '', 120);
    $product = commerce_fetch_product($pdo, $productId, false);
    if (!$product || ($product['product_type'] ?? '') !== 'account') send_json(404, ['message' => 'Simpan produk akun sebelum menyinkronkan stok.']);
    $query = $pdo->prepare('SELECT * FROM account_product_sources WHERE product_id = ?');
    $query->execute([$productId]);
    $source = $query->fetch();
    if (!$source) send_json(422, ['message' => 'Pilih Spreadsheet dan tab lalu simpan produk terlebih dahulu.']);
    account_stock_key();
    // Validate the entire tab before changing any local stock.
    $rows = account_sheet_rows($source['spreadsheet_id'], $source['sheet_tab']);
    $count = account_stock_import($pdo, $source, $rows);

    $pending = $pdo->prepare("SELECT order_id FROM product_account_stock WHERE product_id = ? AND status = 'sold' AND (sheet_synced = 0 OR email_status <> 'sent') ORDER BY last_attempt_at ASC, id ASC LIMIT 5");
    $pending->execute([$productId]);
    foreach ($pending->fetchAll(PDO::FETCH_COLUMN) as $orderId) account_stock_dispatch($pdo, $orderId);
    $statusQuery = $pdo->prepare("SELECT COUNT(*) FROM product_account_stock WHERE product_id = ? AND status = 'sold' AND (sheet_synced = 0 OR email_status <> 'sent')");
    $statusQuery->execute([$productId]);
    $pendingCount = (int) $statusQuery->fetchColumn();
    send_json(200, array_merge(fetch_digital_products($pdo, $user), ['available' => $count, 'pendingDeliveries' => $pendingCount,
        'message' => "Stok tersinkron: {$count} akun tersedia." . ($pendingCount ? " {$pendingCount} pengiriman/email atau pembaruan Sheet masih menunggu; klik sinkronisasi untuk mencoba kembali." : '')]));
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    $message = $error instanceof PDOException ? 'Stok belum dapat disinkronkan. Pastikan tab yang sama tidak dipakai untuk produk lain.'
        : ($error instanceof JsonException ? 'Respons konfigurasi atau Google tidak valid.' : $error->getMessage());
    send_json(422, ['message' => $message]);
}
