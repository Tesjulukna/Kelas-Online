<?php
declare(strict_types=1);

function api_config(): array { return []; }
function clean_text($value, int $length = 80): string { return substr(trim(strip_tags((string) $value)), 0, $length); }
function clean_email($value): string { return strtolower(trim((string) $value)); }
function clean_number($value, int $min, int $max): int { return min($max, max($min, (int) $value)); }
function clean_asset_url($value, int $length = 1000): string { return (string) $value; }
function make_id(string $prefix): string { return $prefix . bin2hex(random_bytes(8)); }
function tripay_absolute_url(string $path): string { return 'https://example.test' . $path; }
require __DIR__ . '/../../public/api/_account-stock.php';
require __DIR__ . '/../../public/api/_commerce.php';
require __DIR__ . '/../../public/api/_digital-products-common.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function rejects(callable $callback, string $message): void {
    try { $callback(); } catch (Throwable $error) { return; }
    throw new RuntimeException($message);
}

// Real inventory SQL on SQLite; adapt only MySQL lock/schema syntax.
// Production simultaneous transactions must additionally be checked on InnoDB.
class InventoryTestPDO extends PDO {
    public int $locks = 0;
    public function prepare(string $query, array $options = []): PDOStatement|false {
        if (str_contains($query, 'FOR UPDATE')) $this->locks++;
        return parent::prepare(str_replace(' FOR UPDATE', '', $query), $options);
    }
    public function exec(string $statement): int|false {
        if (str_contains($statement, 'CREATE TABLE IF NOT EXISTS product_account_stock')) {
            return parent::exec("CREATE TABLE IF NOT EXISTS product_account_stock (
                id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT, source_key TEXT UNIQUE, username_key TEXT UNIQUE,
                account_id TEXT, credentials TEXT, status TEXT DEFAULT 'available', order_id TEXT UNIQUE,
                reserved_until INTEGER, buyer_email TEXT DEFAULT '', sold_at TEXT, sheet_synced INTEGER DEFAULT 0,
                product_title TEXT, delivery_note TEXT, delivery_url TEXT,
                email_status TEXT DEFAULT 'pending', email_claimed_until INTEGER, email_sent_at TEXT, last_attempt_at INTEGER)");
        }
        return parent::exec(preg_replace('/ ENGINE=InnoDB.*$/s', '', $statement));
    }
}
putenv('ACCOUNT_STOCK_KEY=' . str_repeat('ab', 32));
$pdo = new InventoryTestPDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec('CREATE TABLE digital_products (id TEXT PRIMARY KEY, product_type TEXT, title TEXT, item_quantity_enabled INTEGER, item_quantity INTEGER, updated_at TEXT)');
$pdo->exec('CREATE TABLE digital_product_access (id TEXT PRIMARY KEY, product_id TEXT, product_title TEXT, member_id TEXT, buyer_name TEXT, buyer_email TEXT, source TEXT, order_id TEXT, status TEXT, download_url TEXT)');
account_stock_ensure_schema($pdo);
$pdo->exec("INSERT INTO digital_products VALUES ('accounts', 'account', 'Produk Akun', 1, 0, '')");
$pdo->exec('ALTER TABLE digital_products ADD file_url TEXT');
$pdo->exec('ALTER TABLE digital_products ADD file_name TEXT');
$pdo->exec("UPDATE digital_products SET file_url = 'https://example.test/link-produk', file_name = 'Panduan akun'");
$source = ['product_id' => 'accounts', 'spreadsheet_id' => 'spreadsheet-test-id', 'sheet_tab' => "Stok O'Brien"];
$query = $pdo->prepare('INSERT INTO account_product_sources (product_id, spreadsheet_id, sheet_tab) VALUES (?, ?, ?)');
$query->execute(array_values($source));
$header = ['id', 'username', 'password', 'status', 'order_id', 'buyer_email'];
$sheet = [$header];
for ($i = 1; $i <= 50; $i++) $sheet[] = ['akun-' . $i, 'akun' . $i . '@example.test', '  <p>&"💡' . $i . '  ', 'available', '', ''];
$parsed = account_parse_sheet_rows($sheet);
check(account_stock_import($pdo, $source, $parsed) === 50, 'Impor 50 akun.');
$cipher = $pdo->query('SELECT credentials FROM product_account_stock ORDER BY id LIMIT 1')->fetchColumn();
check(!str_contains($cipher, 'example.test'), 'Kredensial harus terenkripsi.');
check(account_stock_decrypt($cipher)['password'] === $sheet[1][2], 'Spasi dan simbol password harus dipertahankan.');
$tampered = base64_decode($cipher);
$tampered[30] = chr(ord($tampered[30]) ^ 1);
rejects(fn() => account_stock_decrypt(base64_encode($tampered)), 'Ciphertext yang diubah harus ditolak.');
$args = ['productId' => 'accounts', 'orderId' => 'paid-order-1', 'memberId' => 'member-1', 'buyerEmail' => 'buyer@example.test', 'buyerName' => 'Pembeli'];
$result = commerce_grant_digital_product_access($pdo, $args);
check($result['granted'], 'Pembayaran membuat akses.');
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 49, 'Stok 50 menjadi 49.');
$first = $pdo->query("SELECT * FROM product_account_stock WHERE order_id = 'paid-order-1'")->fetch();
check($first['account_id'] === 'akun-1' && $first['status'] === 'sold', 'Akun pertama harus terjual.');
$repeat = commerce_grant_digital_product_access($pdo, $args);
check(!$repeat['granted'] && $repeat['access']['id'] === $result['access']['id'], 'Callback berulang harus memakai akses sama.');
check((int) $pdo->query('SELECT COUNT(*) FROM digital_product_access')->fetchColumn() === 1, 'Tidak ada akses ganda.');
check(account_stock_import($pdo, $source, $parsed) === 49, 'Sheet lama tidak boleh mengaktifkan akun terjual.');
$owner = ['role' => 'member', 'userId' => 'member-1', 'email' => 'buyer@example.test'];
check(account_stock_delivery($pdo, 'paid-order-1', 'accounts', $owner)['username'] === 'akun1@example.test', 'Pembeli berhak mengakses akun.');
check(account_stock_delivery($pdo, 'paid-order-1', 'accounts', null) === null, 'Tamu tidak boleh melihat password.');
check(account_stock_delivery($pdo, 'paid-order-1', 'accounts', ['role' => 'member', 'userId' => 'other', 'email' => 'other@example.test']) === null, 'Member lain tidak boleh melihat password.');
account_stock_reserve($pdo, 'accounts', 'pending-order', time() + 600);
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 48, 'Invoice menahan satu akun.');
$reserved = $pdo->query("SELECT id FROM product_account_stock WHERE order_id = 'pending-order'")->fetchColumn();
$pdo->beginTransaction();
$assigned = account_stock_assign($pdo, 'accounts', 'pending-order', 'buyer2@example.test');
check($assigned['id'] === $reserved, 'Pembayaran memakai akun yang direservasi.');
$pdo->rollBack();
check($pdo->query("SELECT status FROM product_account_stock WHERE order_id = 'pending-order'")->fetchColumn() === 'reserved', 'Rollback mempertahankan reservasi.');
account_stock_release($pdo, 'pending-order');
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 49, 'Invoice gagal mengembalikan stok.');
account_stock_reserve($pdo, 'accounts', 'expired-order', time() - 1);
$pdo->beginTransaction();
account_stock_release_expired($pdo, 'accounts');
account_stock_refresh_count($pdo, 'accounts');
$pdo->commit();
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 49, 'Reservasi kedaluwarsa dilepas.');
$second = commerce_grant_digital_product_access($pdo, array_merge($args, ['orderId' => 'paid-order-2']));
check($second['granted'], 'Pembelian ulang memperoleh akun baru.');
check((int) $pdo->query("SELECT COUNT(*) FROM product_account_stock WHERE status = 'sold'")->fetchColumn() === 2, 'Dua pembelian memperoleh dua akun.');
$removed = $parsed;
unset($removed['akun-3']);
check(account_stock_import($pdo, $source, $removed) === 47, 'Baris yang dihapus harus berhenti dijual.');
$reintroduced = $removed;
$reintroduced['new-id'] = ['id' => 'new-id', 'username' => 'akun1@example.test', 'password' => 'changed', 'status' => 'available'];
rejects(fn() => account_stock_import($pdo, $source, $reintroduced), 'ID baru tidak boleh menjual ulang username terjual.');
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 47, 'Impor gagal rollback.');
rejects(fn() => account_parse_sheet_rows([['wrong']]), 'Header salah ditolak.');
rejects(fn() => account_parse_sheet_rows([$header, ['x', 'user', 'pw'], ['x', 'user2', 'pw']]), 'ID berulang ditolak.');
rejects(fn() => account_parse_sheet_rows([$header, ['x', 'user', 'pw'], ['y', 'USER', 'pw']]), 'Username berulang ditolak.');
rejects(fn() => account_parse_sheet_rows([$header, ['x', 'user', 'pw', 'available', 'old-order', '']]), 'Order lama tidak boleh tersedia.');
check(account_sheet_id('https://docs.google.com/spreadsheets/d/spreadsheet-test-id/edit#gid=0') === 'spreadsheet-test-id', 'Link Sheet diterima.');
rejects(fn() => account_sheet_id('https://example.test/private'), 'URL selain Sheets ditolak.');
check(account_sheet_range("Stok O'Brien", 'A1:F1') === "'Stok O''Brien'!A1:F1", 'A1 range aman.');
check(account_sheet_tabs(['sheets' => [
    ['properties' => ['sheetId' => 0, 'title' => 'Stok A']],
    ['properties' => ['sheetId' => 3, 'title' => 'Stok B', 'sheetType' => 'GRID']],
    ['properties' => ['sheetId' => 4, 'title' => 'Grafik', 'sheetType' => 'OBJECT']],
]]) === [['id' => 0, 'title' => 'Stok A'], ['id' => 3, 'title' => 'Stok B']], 'Deteksi tab harus mengembalikan semua tab data, termasuk gid 0.');
$public = digital_product_public(['id' => 'accounts', 'title' => 'Akun', 'product_type' => 'account', 'credentials' => 'secret']);
check($public['productType'] === 'account' && !array_key_exists('credentials', $public), 'Katalog mempertahankan jenis tanpa password.');
check($pdo->locks > 0, 'Pembagian menggunakan row lock.');
$messages = [];
$send = static function (array $message) use (&$messages): array {
    $messages[] = $message;
    return ['sent' => count($messages) > 1];
};
$sheetUnavailable = static function (): void { throw new RuntimeException('Offline'); };
account_stock_dispatch($pdo, 'paid-order-1', $send, $sheetUnavailable);
check($pdo->query("SELECT email_status FROM product_account_stock WHERE order_id = 'paid-order-1'")->fetchColumn() === 'pending', 'Email gagal harus tetap menunggu retry.');
account_stock_dispatch($pdo, 'paid-order-1', $send, $sheetUnavailable);
account_stock_dispatch($pdo, 'paid-order-1', $send, $sheetUnavailable);
check(count($messages) === 2, 'Email sukses tidak boleh dikirim kembali.');
check($messages[0] === $messages[1] && $messages[0]['accountCredentials']['password'] === $sheet[1][2], 'Retry harus mengirim akun dan payload yang sama.');
check($messages[0]['accountCredentials']['productUrl'] === 'https://example.test/link-produk' && $messages[0]['accountCredentials']['fileName'] === 'Panduan akun', 'Link produk dan nama file harus ikut bersama akun dalam email.');
check(account_stock_delivery($pdo, 'paid-order-1', 'accounts', $owner)['productUrl'] === 'https://example.test/link-produk', 'Link produk tersedia bersama kredensial di halaman akses pembeli.');
check($pdo->query("SELECT status FROM product_account_stock WHERE order_id = 'paid-order-1'")->fetchColumn() === 'sold', 'Google offline tidak boleh membatalkan penjualan.');
$pdo->exec("CREATE TRIGGER fail_access BEFORE INSERT ON digital_product_access BEGIN SELECT RAISE(ABORT, 'test access insert failure'); END");
rejects(fn() => commerce_grant_digital_product_access($pdo, array_merge($args, ['orderId' => 'broken-order'])), 'Gagal membuat akses harus menggagalkan penjualan.');
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 47, 'Kegagalan akses harus mengembalikan stok.');
$pdo->exec('DROP TRIGGER fail_access');
$otherSource = array_merge($source, ['sheet_tab' => 'Tab Berbeda']);
rejects(fn() => account_stock_import($pdo, $otherSource, $parsed), 'Sinkronisasi tidak boleh memakai sumber lama yang sudah diubah.');
for ($i = 0; $i < 47; $i++) account_stock_reserve($pdo, 'accounts', 'reserve-' . $i, time() + 600);
rejects(fn() => account_stock_reserve($pdo, 'accounts', 'overbooked-order', time() + 600), 'Stok terakhir yang direservasi tidak boleh dipesan lagi.');
check((int) $pdo->query("SELECT item_quantity FROM digital_products WHERE id = 'accounts'")->fetchColumn() === 0, 'Stok tersedia tidak boleh negatif.');
echo "PASS: import, 50->49, idempotency, reservations, rollback, ownership, encryption, resync, validation\n";
