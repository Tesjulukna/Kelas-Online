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
    if (($payload['action'] ?? '') === 'create_tab') {
        $id = account_sheet_id((string) ($payload['spreadsheet'] ?? ''));
        $tab = trim((string) ($payload['tab'] ?? ''));
        account_sheet_range($tab, 'A1:F1');
        $kind = ($payload['kind'] ?? '') === 'auto_account' ? 'auto_account' : 'account';
        $created = account_gas_request('create_tab', $id, ['tab' => $tab, 'kind' => $kind]);
        $tabs = account_sheet_tabs(account_gas_request('tabs', $id));
        send_json(200, ['spreadsheetId' => $id, 'tab' => $created['tab'], 'tabs' => $tabs, 'message' => 'Tab siap digunakan.']);
    }
    if (in_array($payload['action'] ?? '', ['rows', 'update_row'], true)) {
        $id = account_sheet_id((string) ($payload['spreadsheet'] ?? ''));
        $tab = (string) ($payload['tab'] ?? '');
        account_sheet_range($tab, 'A1:F1');
        $pdo = db();
        account_stock_ensure_schema($pdo);
        if ($payload['action'] === 'update_row') {
            $original = $payload['original'] ?? [];
            $updated = $payload['updated'] ?? [];
            if (!is_array($original) || !is_array($updated) || count($original) !== 6 || count($updated) !== 6
                || !array_is_list($original) || !array_is_list($updated)
                || count(array_filter($original, 'is_string')) !== 6 || count(array_filter($updated, 'is_string')) !== 6
                || $original[0] !== $updated[0] || $updated[4] !== '' || $updated[5] !== '' || !in_array($updated[3], ['available', 'disabled'], true)) {
                send_json(422, ['message' => 'Data baris tidak valid. ID akun dan data pembelian tidak dapat diubah.']);
            }
            account_parse_sheet_rows([['id', 'username', 'password', 'status', 'order_id', 'buyer_email'], $updated]);
            $pdo->beginTransaction();
            $sourceQuery = $pdo->prepare('SELECT product_id FROM account_product_sources WHERE spreadsheet_id = ? AND sheet_tab = ? ORDER BY product_id');
            $sourceQuery->execute([$id, $tab]);
            foreach ($sourceQuery->fetchAll(PDO::FETCH_COLUMN) as $stockProductId) {
                $lock = $pdo->prepare('SELECT id FROM digital_products WHERE id = ? FOR UPDATE');
                $lock->execute([$stockProductId]);
            }
            $stockQuery = $pdo->prepare('SELECT s.* FROM product_account_stock s JOIN account_product_sources p ON p.product_id = s.product_id WHERE p.spreadsheet_id = ? AND p.sheet_tab = ? AND s.account_id = ? FOR UPDATE');
            $stockQuery->execute([$id, $tab, trim($original[0])]);
            $stock = $stockQuery->fetch();
            account_stock_assert_editable($stock ?: null);
            $usernameKey = hash('sha256', $id . "\0" . $tab . "\0" . strtolower(trim($updated[1])));
            $duplicate = $pdo->prepare('SELECT id FROM product_account_stock WHERE username_key = ? AND account_id <> ? LIMIT 1');
            $duplicate->execute([$usernameKey, trim($original[0])]);
            if ($duplicate->fetchColumn()) throw new RuntimeException('Email/username sudah dipakai oleh akun stok lain.');
            $encrypted = $stock ? account_stock_encrypt(['username' => $updated[1], 'password' => $updated[2]]) : null;
            $data = account_gas_request('update_row', $id, ['tab' => $tab, 'original' => $original, 'updated' => $updated]);
            $sheetWriteCompleted = true;
            if (!is_array($data['values'] ?? null)) throw new RuntimeException('Respons editor GAS tidak valid. Muat ulang untuk memeriksa hasil penyimpanan.');
            if ($stock) {
                $update = $pdo->prepare('UPDATE product_account_stock SET credentials = ?, status = ?, username_key = ? WHERE id = ?');
                $update->execute([$encrypted, $updated[3], $usernameKey, $stock['id']]);
                account_stock_refresh_count($pdo, $stock['product_id']);
            }
            $pdo->commit();
        } else {
            $data = account_gas_request(($payload['kind'] ?? '') === 'auto_account' ? 'token_rows' : 'rows', $id, ['tab' => $tab]);
        }
        $statuses = $pdo->prepare('SELECT s.account_id, s.status FROM product_account_stock s JOIN account_product_sources p ON p.product_id = s.product_id WHERE p.spreadsheet_id = ? AND p.sheet_tab = ?');
        $statuses->execute([$id, $tab]);
        send_json(200, ['values' => $data['values'] ?? [], 'stockStatuses' => ($payload['kind'] ?? '') === 'auto_account' ? [] : $statuses->fetchAll(PDO::FETCH_KEY_PAIR),
            'message' => $payload['action'] === 'update_row' ? 'Baris Spreadsheet berhasil disimpan.' : 'Data Spreadsheet berhasil dimuat.']);
    }
    if (($payload['action'] ?? '') !== 'sync') send_json(400, ['message' => 'Aksi stok akun tidak valid.']);
    $pdo = db();
    ensure_digital_products_schema($pdo);
    $productId = clean_text($payload['productId'] ?? '', 120);
    $product = commerce_fetch_product($pdo, $productId, false);
    if (!$product || !in_array($product['product_type'] ?? '', ['account', 'auto_account'], true)) send_json(404, ['message' => 'Simpan produk akun sebelum menyinkronkan stok.']);
    $query = $pdo->prepare('SELECT * FROM account_product_sources WHERE product_id = ?');
    $query->execute([$productId]);
    $source = $query->fetch();
    if (!$source) send_json(422, ['message' => 'Pilih Spreadsheet dan tab lalu simpan produk terlebih dahulu.']);
    account_stock_key();
    // Validate the entire tab before changing any local stock.
    if (($product['product_type'] ?? '') === 'auto_account') {
        account_gas_request('token_rows', $source['spreadsheet_id'], ['tab' => $source['sheet_tab']]);
        $count = 0;
    } else {
        $rows = account_sheet_rows($source['spreadsheet_id'], $source['sheet_tab']);
        $count = account_stock_import($pdo, $source, $rows);
    }

    $pending = $pdo->prepare("SELECT order_id FROM product_account_stock WHERE product_id = ? AND status = 'sold' AND (sheet_synced = 0 OR email_status <> 'sent') ORDER BY last_attempt_at ASC, id ASC LIMIT 5");
    $pending->execute([$productId]);
    foreach ($pending->fetchAll(PDO::FETCH_COLUMN) as $orderId) account_stock_dispatch($pdo, $orderId);
    $statusQuery = $pdo->prepare("SELECT COUNT(*) FROM product_account_stock WHERE product_id = ? AND status = 'sold' AND (sheet_synced = 0 OR email_status <> 'sent')");
    $statusQuery->execute([$productId]);
    $pendingCount = (int) $statusQuery->fetchColumn();
    send_json(200, array_merge(fetch_digital_products($pdo, $user), ['available' => $count, 'pendingDeliveries' => $pendingCount,
        'message' => (($product['product_type'] ?? '') === 'auto_account' ? 'Tab akun otomatis terhubung. Token dibuat setelah pembayaran sukses.' : "Stok tersinkron: {$count} akun tersedia.") . ($pendingCount ? " {$pendingCount} pengiriman/email atau pembaruan Sheet masih menunggu; klik sinkronisasi untuk mencoba kembali." : '')]));
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (!empty($sheetWriteCompleted) && !empty($stock)) {
        try {
            $pdo->beginTransaction();
            $lock = $pdo->prepare('SELECT id FROM digital_products WHERE id = ? FOR UPDATE');
            $lock->execute([$stock['product_id']]);
            $disable = $pdo->prepare("UPDATE product_account_stock SET status = 'disabled' WHERE id = ? AND status IN ('available', 'disabled')");
            $disable->execute([$stock['id']]);
            account_stock_refresh_count($pdo, $stock['product_id']);
            $pdo->commit();
        } catch (Throwable $cleanupError) { if ($pdo->inTransaction()) $pdo->rollBack(); }
        send_json(422, ['message' => 'Spreadsheet sudah menerima perubahan, tetapi stok website belum tersinkron. Muat ulang data dan jalankan Sinkronkan Stok sebelum menjual akun ini.']);
    }
    $message = $error instanceof PDOException ? 'Stok belum dapat disinkronkan. Pastikan tab yang sama tidak dipakai untuk produk lain.'
        : ($error instanceof JsonException ? 'Respons konfigurasi atau Google tidak valid.' : $error->getMessage());
    send_json(422, ['message' => $message]);
}
