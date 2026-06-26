<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST']);
require_user('admin');

$pdo = db();

ensure_site_settings_table($pdo);

function backup_tables(): array
{
    return [
        'accounts',
        'classes',
        'materials',
        'material_assets',
        'support_tickets',
        'submissions',
        'member_progress',
        'lynk_orders',
        'tripay_orders',
        'payment_snapshots',
        'digital_products',
        'digital_product_access',
        'testimonials',
        'certificate_templates',
        'certificates',
        'certificate_name_change_requests',
        'analytics_events',
        'site_settings',
    ];
}

function table_exists(PDO $pdo, string $table): bool
{
    try {
        $query = $pdo->prepare('SHOW TABLES LIKE ?');
        $query->execute([$table]);

        return (bool) $query->fetchColumn();
    } catch (Throwable $error) {
        return false;
    }
}

function fetch_table_rows(PDO $pdo, string $table): array
{
    if (!table_exists($pdo, $table)) {
        return [];
    }

    return $pdo->query("SELECT * FROM `$table`")->fetchAll();
}

function table_columns(PDO $pdo, string $table): array
{
    if (!table_exists($pdo, $table)) {
        return [];
    }

    $columns = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll();

    return array_map(static fn(array $column): string => (string) $column['Field'], $columns);
}

function insert_table_rows(PDO $pdo, string $table, array $rows): void
{
    $columns = table_columns($pdo, $table);

    if (!$columns) {
        return;
    }

    $columnSet = array_flip($columns);

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $cleanRow = array_intersect_key($row, $columnSet);

        if (!$cleanRow) {
            continue;
        }

        $names = array_keys($cleanRow);
        $quotedNames = array_map(static fn(string $name): string => "`$name`", $names);
        $placeholders = implode(', ', array_fill(0, count($names), '?'));
        $query = $pdo->prepare(
            "INSERT INTO `$table` (" . implode(', ', $quotedNames) . ") VALUES ($placeholders)",
        );
        $query->execute(array_values($cleanRow));
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $tables = [];

    foreach (backup_tables() as $table) {
        $tables[$table] = fetch_table_rows($pdo, $table);
    }

    $fileName = 'backup-ibnucreative-' . date('Y-m-d') . '.json';

    header('Cache-Control: no-store');
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $fileName . '"');
    echo json_encode([
        'type' => 'ibnucreative-full-backup',
        'version' => 1,
        'exportedAt' => date(DATE_ATOM),
        'websiteSettings' => fetch_website_settings($pdo),
        'tables' => $tables,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = read_json_body();
$backup = is_array($payload['backup'] ?? null) ? $payload['backup'] : $payload;
$tables = is_array($backup['tables'] ?? null) ? $backup['tables'] : [];

if (!$tables) {
    send_json(400, ['message' => 'File backup tidak memuat data tabel.']);
}

$deleteOrder = [
    'material_assets',
    'materials',
    'submissions',
    'support_tickets',
    'member_progress',
    'tripay_orders',
    'payment_snapshots',
    'digital_product_access',
    'digital_products',
    'testimonials',
    'certificate_name_change_requests',
    'certificates',
    'certificate_templates',
    'analytics_events',
    'lynk_orders',
    'classes',
    'accounts',
    'site_settings',
];
$insertOrder = [
    'accounts',
    'classes',
    'materials',
    'material_assets',
    'support_tickets',
    'submissions',
    'member_progress',
    'lynk_orders',
    'tripay_orders',
    'payment_snapshots',
    'digital_products',
    'digital_product_access',
    'testimonials',
    'certificate_templates',
    'certificates',
    'certificate_name_change_requests',
    'analytics_events',
    'site_settings',
];

try {
    $pdo->beginTransaction();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    foreach ($deleteOrder as $table) {
        if (table_exists($pdo, $table)) {
            $pdo->exec("DELETE FROM `$table`");
        }
    }

    foreach ($insertOrder as $table) {
        $rows = is_array($tables[$table] ?? null) ? $tables[$table] : [];
        insert_table_rows($pdo, $table, $rows);
    }

    if (empty($tables['site_settings']) && is_array($backup['websiteSettings'] ?? null)) {
        save_website_settings($pdo, $backup['websiteSettings']);
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    } catch (Throwable $ignored) {
        // Keep the original restore error.
    }

    send_json(500, ['message' => 'Backup tidak bisa dipulihkan.']);
}

send_json(200, [
    'message' => 'Backup berhasil dipulihkan.',
    'settings' => fetch_website_settings($pdo),
    'updatedAt' => updated_at($pdo),
]);
