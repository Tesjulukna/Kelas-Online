<?php

declare(strict_types=1);

require_once __DIR__ . '/_account-gas.php';

// Credentials never belong in catalog responses or checkout payloads.
function account_stock_key(): string
{
    $config = api_config();
    $hex = (string) (getenv('ACCOUNT_STOCK_KEY') ?: ($config['account_stock_key'] ?? ''));
    if ($hex === '') {
        $file = (string) (getenv('ACCOUNT_STOCK_KEY_FILE') ?: ($config['account_stock_key_file'] ?? dirname(__DIR__, 3) . '/.ibnucreative-private/account-stock.key'));
        return account_stock_file_key($file, trim((string) ($_SERVER['DOCUMENT_ROOT'] ?? '')) ?: dirname(__DIR__));
    }
    if (!preg_match('/^[a-f0-9]{64}$/i', $hex)) {
        throw new RuntimeException('Kunci enkripsi stok akun yang dikonfigurasi tidak valid.');
    }
    return hex2bin($hex);
}

function account_stock_file_key(string $file, string $publicRoot): string
{
    $directory = dirname($file);
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Folder privat kunci tidak dapat dibuat. Beri izin tulis pada folder home hosting atau atur account_stock_key_file di luar public_html.');
    }
    $privateDirectory = realpath($directory);
    $root = realpath($publicRoot);
    if ($privateDirectory === false || $root === false) throw new RuntimeException('Lokasi folder privat kunci tidak valid.');
    $normalize = static fn(string $path): string => strtolower(str_replace('\\', '/', rtrim($path, '/\\')));
    $privatePath = $normalize($privateDirectory);
    $publicPath = $normalize($root);
    if ($privatePath === $publicPath || strpos($privatePath . '/', $publicPath . '/') === 0 || is_link($file)) {
        throw new RuntimeException('File kunci harus disimpan di luar folder publik website.');
    }
    $file = $privateDirectory . DIRECTORY_SEPARATOR . basename($file);
    $lock = @fopen($file . '.lock', 'c');
    if ($lock === false) throw new RuntimeException('File kunci privat tidak dapat dibuat. Periksa izin tulis hosting.');
    @chmod($file . '.lock', 0600);
    $temporary = null;
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Kunci enkripsi belum dapat dikunci. Coba lagi.');
        if (is_file($file)) {
            $hex = trim((string) @file_get_contents($file));
            if (!preg_match('/^[a-f0-9]{64}$/i', $hex)) throw new RuntimeException('File kunci enkripsi tidak valid. Pulihkan dari backup; kunci tidak diganti otomatis.');
            return hex2bin($hex);
        }
        $hex = bin2hex(random_bytes(32));
        $temporary = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $handle = @fopen($temporary, 'x');
        if ($handle === false) throw new RuntimeException('File kunci sementara tidak dapat dibuat.');
        try {
            if (!chmod($temporary, 0600) || fwrite($handle, $hex) !== 64 || !fflush($handle)) throw new RuntimeException('Kunci enkripsi tidak dapat disimpan dengan aman.');
        } finally { fclose($handle); }
        if (!@rename($temporary, $file)) throw new RuntimeException('File kunci enkripsi tidak dapat disimpan.');
        $temporary = null;
        return hex2bin($hex);
    } finally {
        if ($temporary !== null && is_file($temporary)) @unlink($temporary);
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function account_stock_encrypt(array $credentials): string
{
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt(json_encode($credentials, JSON_THROW_ON_ERROR), 'aes-256-gcm', account_stock_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Data akun tidak dapat dienkripsi.');
    return base64_encode($iv . $tag . $cipher);
}

function account_stock_decrypt(string $encrypted): array
{
    $data = base64_decode($encrypted, true);
    if ($data === false || strlen($data) < 29) throw new RuntimeException('Data akun tidak valid.');
    $plain = openssl_decrypt(substr($data, 28), 'aes-256-gcm', account_stock_key(), OPENSSL_RAW_DATA, substr($data, 0, 12), substr($data, 12, 16));
    if ($plain === false) throw new RuntimeException('Data akun tidak dapat dibuka. Periksa kunci enkripsi server.');
    return json_decode($plain, true, 512, JSON_THROW_ON_ERROR);
}

function account_stock_ensure_schema(PDO $pdo): void
{
    static $ready = [];
    $key = spl_object_id($pdo);
    if (isset($ready[$key])) return;
    if ($pdo->inTransaction()) throw new RuntimeException('Skema stok akun harus disiapkan sebelum transaksi.');
    $pdo->exec("CREATE TABLE IF NOT EXISTS account_product_sources (
        product_id VARCHAR(120) PRIMARY KEY,
        spreadsheet_id VARCHAR(180) NOT NULL,
        sheet_tab VARCHAR(100) NOT NULL,
        synced_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
    $pdo->exec("CREATE TABLE IF NOT EXISTS product_account_stock (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(120) NOT NULL,
        source_key CHAR(64) NOT NULL UNIQUE,
        username_key CHAR(64) NOT NULL UNIQUE,
        account_id VARCHAR(120) NOT NULL,
        credentials LONGTEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        order_id VARCHAR(180) NULL UNIQUE,
        reserved_until BIGINT NULL,
        buyer_email VARCHAR(180) NOT NULL DEFAULT '',
        product_title VARCHAR(180) NOT NULL DEFAULT '',
        delivery_note LONGTEXT NULL,
        delivery_url TEXT NULL,
        sold_at DATETIME NULL,
        sheet_synced TINYINT NOT NULL DEFAULT 0,
        email_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        email_claimed_until BIGINT NULL,
        email_sent_at DATETIME NULL,
        last_attempt_at BIGINT NULL,
        INDEX product_stock (product_id, status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
    $ready[$key] = true;
}

function account_sheet_id(string $input): string
{
    $input = trim($input);
    if (preg_match('#^https://docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)(?:/|$)#', $input, $match)) $input = $match[1];
    if (!preg_match('/^[a-zA-Z0-9_-]{10,180}$/', $input)) throw new InvalidArgumentException('Link atau ID Google Spreadsheet tidak valid.');
    return $input;
}

function account_sheet_range(string $tab, string $cells): string
{
    if ($tab === '' || strlen($tab) > 100) throw new InvalidArgumentException('Pilih tab Spreadsheet terlebih dahulu.');
    return "'" . str_replace("'", "''", $tab) . "'!" . $cells;
}

function account_sheet_tabs(array $spreadsheet): array
{
    $tabs = [];
    foreach ($spreadsheet['sheets'] ?? [] as $sheet) {
        $properties = $sheet['properties'] ?? [];
        if (($properties['sheetType'] ?? 'GRID') === 'GRID' && isset($properties['sheetId'], $properties['title'])) {
            $tabs[] = ['id' => $properties['sheetId'], 'title' => $properties['title']];
        }
    }
    return $tabs;
}

function account_sheet_rows(string $spreadsheetId, string $tab): array
{
    $response = account_gas_request('rows', account_sheet_id($spreadsheetId), ['tab' => $tab]);
    return account_parse_sheet_rows($response['values'] ?? []);
}

function account_parse_sheet_rows(array $values): array
{
    $header = array_map(static fn($cell): string => strtolower(trim((string) $cell)), array_pad($values[0] ?? [], 6, ''));
    if (array_slice($header, 0, 6) !== ['id', 'username', 'password', 'status', 'order_id', 'buyer_email']) {
        throw new InvalidArgumentException('Baris pertama harus: id, username, password, status, order_id, buyer_email (kolom A–F).');
    }
    if (count($values) > 10001) throw new InvalidArgumentException('Maksimal 10.000 akun per tab.');
    $accounts = [];
    $usernames = [];
    foreach (array_slice($values, 1) as $index => $row) {
        if (!array_filter($row, static fn($cell): bool => trim((string) $cell) !== '')) continue;
        [$id, $username, $password, $status, $orderId, $buyerEmail] = array_pad($row, 6, '');
        $id = trim((string) $id);
        $status = strtolower(trim((string) $status));
        $status = ['tersedia' => 'available', 'terjual' => 'sold', 'nonaktif' => 'disabled'][$status] ?? $status;
        $status = $status ?: 'available';
        if ($id === '' || strlen($id) > 120 || isset($accounts[$id]) || trim((string) $username) === '' || (string) $password === '' || strlen((string) $password) > 4000 || strlen((string) $username) > 500 || !in_array($status, ['available', 'sold', 'disabled'], true)) {
            throw new InvalidArgumentException('Data stok tidak valid atau ID berulang pada baris ' . ($index + 2) . '.');
        }
        if ($status === 'available' && (trim((string) $orderId) !== '' || trim((string) $buyerEmail) !== '')) {
            throw new InvalidArgumentException('Akun dengan data pembelian tidak boleh tersedia: baris ' . ($index + 2) . '.');
        }
        $usernameKey = strtolower(trim((string) $username));
        if (isset($usernames[$usernameKey])) throw new InvalidArgumentException('Email/username berulang pada baris ' . ($index + 2) . '.');
        $usernames[$usernameKey] = true;
        $accounts[$id] = ['id' => $id, 'username' => (string) $username, 'password' => (string) $password,
            'status' => $status, 'row' => $index + 2];
    }
    return $accounts;
}

function account_stock_refresh_count(PDO $pdo, string $productId): int
{
    $query = $pdo->prepare("SELECT COUNT(*) FROM product_account_stock WHERE product_id = ? AND status = 'available'");
    $query->execute([$productId]);
    $count = (int) $query->fetchColumn();
    $update = $pdo->prepare('UPDATE digital_products SET item_quantity_enabled = 1, item_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    $update->execute([$count, $productId]);
    return $count;
}

function account_stock_import(PDO $pdo, array $source, array $rows): int
{
    $productId = $source['product_id'];
    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('SELECT product_type FROM digital_products WHERE id = ? FOR UPDATE');
        $lock->execute([$productId]);
        if ($lock->fetchColumn() !== 'account') throw new RuntimeException('Produk akun tidak tersedia.');
        $sourceQuery = $pdo->prepare('SELECT spreadsheet_id, sheet_tab FROM account_product_sources WHERE product_id = ? FOR UPDATE');
        $sourceQuery->execute([$productId]);
        $currentSource = $sourceQuery->fetch();
        if (!$currentSource || $currentSource['spreadsheet_id'] !== $source['spreadsheet_id'] || $currentSource['sheet_tab'] !== $source['sheet_tab']) {
            throw new RuntimeException('Sumber Spreadsheet berubah. Muat ulang produk lalu sinkronkan lagi.');
        }
        account_stock_release_expired($pdo, $productId);
        $existingQuery = $pdo->prepare('SELECT * FROM product_account_stock WHERE product_id = ? FOR UPDATE');
        $existingQuery->execute([$productId]);
        $existing = [];
        foreach ($existingQuery->fetchAll() as $row) $existing[$row['account_id']] = $row;
        $insert = $pdo->prepare('INSERT INTO product_account_stock (product_id, source_key, username_key, account_id, credentials, status) VALUES (?, ?, ?, ?, ?, ?)');
        $update = $pdo->prepare("UPDATE product_account_stock SET credentials = ?, status = ?, username_key = ? WHERE id = ? AND status IN ('available', 'disabled')");
        foreach ($rows as $id => $row) {
            $current = $existing[$id] ?? null;
            if ($current && in_array($current['status'], ['sold', 'external_sold', 'reserved'], true)) continue;
            $encrypted = account_stock_encrypt(['username' => $row['username'], 'password' => $row['password']]);
            $status = $row['status'] === 'sold' ? 'external_sold' : $row['status'];
            $prefix = $source['spreadsheet_id'] . "\0" . $source['sheet_tab'] . "\0";
            $usernameKey = hash('sha256', $prefix . strtolower(trim($row['username'])));
            if ($current) $update->execute([$encrypted, $status, $usernameKey, $current['id']]);
            else $insert->execute([$productId, hash('sha256', $prefix . $id), $usernameKey, $id, $encrypted, $status]);
        }
        $disable = $pdo->prepare("UPDATE product_account_stock SET status = 'disabled' WHERE id = ? AND status = 'available'");
        foreach ($existing as $id => $row) if (!isset($rows[$id])) $disable->execute([$row['id']]);
        $count = account_stock_refresh_count($pdo, $productId);
        $updateSource = $pdo->prepare('UPDATE account_product_sources SET synced_at = CURRENT_TIMESTAMP WHERE product_id = ?');
        $updateSource->execute([$productId]);
        $pdo->commit();
        return $count;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function account_stock_release_expired(PDO $pdo, string $productId): void
{
    $query = $pdo->prepare("UPDATE product_account_stock SET status = 'available', order_id = NULL, reserved_until = NULL WHERE product_id = ? AND status = 'reserved' AND reserved_until < ?");
    $query->execute([$productId, time()]);
}

function account_stock_reserve(PDO $pdo, string $productId, string $orderId, int $expiresAt): void
{
    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('SELECT id FROM digital_products WHERE id = ? FOR UPDATE');
        $lock->execute([$productId]);
        account_stock_release_expired($pdo, $productId);
        $query = $pdo->prepare("SELECT id FROM product_account_stock WHERE product_id = ? AND status = 'available' ORDER BY id ASC LIMIT 1 FOR UPDATE");
        $query->execute([$productId]);
        $id = $query->fetchColumn();
        if (!$id) throw new RuntimeException('Stok akun habis atau sedang menunggu pembayaran pembeli lain.');
        $update = $pdo->prepare("UPDATE product_account_stock SET status = 'reserved', order_id = ?, reserved_until = ? WHERE id = ? AND status = 'available'");
        $update->execute([$orderId, $expiresAt, $id]);
        account_stock_refresh_count($pdo, $productId);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function account_stock_prepare_invoice(PDO $pdo, array $product, string $orderId, int $expiresAt): Closure
{
    if (($product['product_type'] ?? '') !== 'account') return static function (): void {};
    account_stock_key();
    account_stock_reserve($pdo, $product['id'], $orderId, $expiresAt + 300);
    $settled = false;
    register_shutdown_function(static function () use ($pdo, $orderId, &$settled): void {
        if ($settled) return;
        try {
            if ($pdo->inTransaction()) $pdo->rollBack();
            account_stock_release($pdo, $orderId);
        } catch (Throwable $error) { /* The reservation also expires automatically. */ }
    });
    return static function () use (&$settled): void { $settled = true; };
}

function account_stock_release(PDO $pdo, string $orderId): void
{
    $query = $pdo->prepare("SELECT product_id FROM product_account_stock WHERE order_id = ? AND status = 'reserved'");
    $query->execute([$orderId]);
    $productId = $query->fetchColumn();
    if (!$productId) return;
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('SELECT id FROM digital_products WHERE id = ? FOR UPDATE');
        $lock->execute([$productId]);
        $update = $pdo->prepare("UPDATE product_account_stock SET status = 'available', order_id = NULL, reserved_until = NULL WHERE order_id = ? AND status = 'reserved'");
        $update->execute([$orderId]);
        account_stock_refresh_count($pdo, $productId);
        if ($ownsTransaction) $pdo->commit();
    } catch (Throwable $error) {
        if ($ownsTransaction && $pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function account_stock_assign(PDO $pdo, string $productId, string $orderId, string $buyerEmail): array
{
    if (!$pdo->inTransaction() || $orderId === '') throw new RuntimeException('Pembagian akun memerlukan transaksi dan ID pesanan.');
    if ($buyerEmail === '') throw new RuntimeException('Email pembeli wajib tersedia untuk pengiriman akun.');
    $lock = $pdo->prepare('SELECT * FROM digital_products WHERE id = ? FOR UPDATE');
    $lock->execute([$productId]);
    $product = $lock->fetch();
    if (!$product) throw new RuntimeException('Produk akun tidak ditemukan.');
    $existing = $pdo->prepare('SELECT * FROM product_account_stock WHERE order_id = ? AND product_id = ? FOR UPDATE');
    $existing->execute([$orderId, $productId]);
    $row = $existing->fetch();
    if ($row && $row['status'] === 'sold') return $row;
    if (!$row) {
        account_stock_release_expired($pdo, $productId);
        $query = $pdo->prepare("SELECT * FROM product_account_stock WHERE product_id = ? AND status = 'available' ORDER BY id ASC LIMIT 1 FOR UPDATE");
        $query->execute([$productId]);
        $row = $query->fetch();
    }
    if (!$row || !in_array($row['status'], ['available', 'reserved'], true)) throw new RuntimeException('Stok akun belum tersedia untuk pesanan ini. Tambahkan stok lalu proses ulang pembayaran.');
    $credentials = account_stock_decrypt($row['credentials']);
    $credentials['productUrl'] = clean_asset_url($product['file_url'] ?? '', 1000);
    $credentials['fileName'] = (string) ($product['file_name'] ?? '');
    $update = $pdo->prepare("UPDATE product_account_stock SET status = 'sold', order_id = ?, buyer_email = ?, product_title = ?, delivery_note = ?, delivery_url = ?, credentials = ?, sold_at = CURRENT_TIMESTAMP, reserved_until = NULL WHERE id = ?");
    $update->execute([$orderId, $buyerEmail, $product['title'], $product['delivery_note'] ?? '', commerce_public_product_access_url($orderId, 'account'), account_stock_encrypt($credentials), $row['id']]);
    account_stock_refresh_count($pdo, $productId);
    return array_merge($row, ['status' => 'sold', 'order_id' => $orderId, 'buyer_email' => $buyerEmail]);
}

function account_stock_delivery(PDO $pdo, string $orderId, string $productId, ?array $user): ?array
{
    if (($user['role'] ?? '') !== 'member' && ($user['role'] ?? '') !== 'admin') return null;
    $query = $pdo->prepare("SELECT s.credentials FROM product_account_stock s JOIN digital_product_access a ON a.order_id = s.order_id AND a.product_id = s.product_id
        WHERE s.order_id = ? AND s.product_id = ? AND s.status = 'sold' AND a.status = 'active'
        AND ((a.member_id <> '' AND a.member_id = ?) OR (a.buyer_email <> '' AND a.buyer_email = ?) OR ? = 'admin') LIMIT 1");
    $query->execute([$orderId, $productId, $user['userId'] ?? '', $user['email'] ?? '', $user['role'] ?? '']);
    $value = $query->fetchColumn();
    return $value ? account_stock_decrypt($value) : null;
}

function account_stock_write_sale(PDO $pdo, array $row): void
{
    $query = $pdo->prepare('SELECT * FROM account_product_sources WHERE product_id = ?');
    $query->execute([$row['product_id']]);
    $source = $query->fetch();
    if (!$source) throw new RuntimeException('Sumber Spreadsheet pesanan tidak tersedia.');
    $result = account_gas_request('mark_sold', $source['spreadsheet_id'], [
        'tab' => $source['sheet_tab'], 'accountId' => $row['account_id'],
        'orderId' => $row['order_id'], 'buyerEmail' => $row['buyer_email'],
    ]);
    if (($result['updated'] ?? false) !== true) throw new RuntimeException('GAS belum mengonfirmasi pembaruan status akun.');
    $update = $pdo->prepare("UPDATE product_account_stock SET sheet_synced = 1 WHERE id = ? AND status = 'sold'");
    $update->execute([$row['id']]);
}

function account_stock_dispatch(PDO $pdo, string $orderId, ?callable $sendEmail = null, ?callable $writeSale = null): array
{
    $query = $pdo->prepare("SELECT * FROM product_account_stock WHERE order_id = ? AND status = 'sold'");
    $query->execute([$orderId]);
    $row = $query->fetch();
    if (!$row) return ['sent' => false];
    // Deliver email first. A slow Google API must not delay delivery to the buyer.
    $result = ['sent' => $row['email_status'] === 'sent'];
    if (!$result['sent']) {
        $claim = $pdo->prepare("UPDATE product_account_stock SET email_status = 'sending', email_claimed_until = ? WHERE id = ? AND (email_status = 'pending' OR (email_status = 'sending' AND email_claimed_until < ?))");
        $claim->execute([time() + 120, $row['id'], time()]);
        if (!$claim->rowCount()) return ['sent' => false];
        try {
            $credentials = account_stock_decrypt($row['credentials']);
            $result = ($sendEmail ?? 'send_digital_product_delivery_email')([
                'buyerName' => 'Pelanggan', 'buyerEmail' => $row['buyer_email'], 'productTitle' => $row['product_title'],
                'productType' => 'account', 'accountCredentials' => $credentials, 'deliveryNote' => $row['delivery_note'],
                'downloadUrl' => $row['delivery_url'] ?? '', 'idempotencyKey' => 'account-delivery/' . hash('sha256', $orderId),
            ]);
        } catch (Throwable $error) { $result = ['sent' => false]; }
        $update = $pdo->prepare('UPDATE product_account_stock SET email_status = ?, email_sent_at = ?, email_claimed_until = NULL WHERE id = ?');
        $update->execute([!empty($result['sent']) ? 'sent' : 'pending', !empty($result['sent']) ? gmdate('Y-m-d H:i:s') : null, $row['id']]);
    }
    // Rotate retries so one broken Sheet row cannot starve later deliveries.
    $touch = $pdo->prepare('UPDATE product_account_stock SET last_attempt_at = ? WHERE id = ?');
    $touch->execute([time(), $row['id']]);
    if (!$row['sheet_synced']) {
        try { ($writeSale ?? 'account_stock_write_sale')($pdo, $row); } catch (Throwable $error) { /* Worker retries this durable pending update. */ }
    }
    return $result;
}
