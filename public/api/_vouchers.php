<?php

declare(strict_types=1);

final class VoucherException extends RuntimeException
{
    private $apiStatus;
    private $errorCode;

    public function __construct(string $message, string $errorCode = 'voucher_invalid', int $apiStatus = 422)
    {
        parent::__construct($message);
        $this->apiStatus = $apiStatus;
        $this->errorCode = $errorCode;
    }

    public function apiStatus(): int
    {
        return $this->apiStatus;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }
}

function voucher_ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    try {
        $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $query->execute([$column]);
        if (!$query->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD `$column` $definition");
        }
    } catch (Throwable $error) {
        // Fresh installs already contain every column. Some shared hosts block ALTER.
    }
}

function voucher_ensure_schema(PDO $pdo): void
{
    static $ready = [];
    $connectionKey = spl_object_hash($pdo);
    if (!empty($ready[$connectionKey])) return;

    try {
        $pdo->query('SELECT id, code, name, description, discount_type, discount_value, max_discount, min_subtotal, starts_at, ends_at, status, total_quota, per_customer_quota, target_type, eligible_items, combine_with_sale, combine_with_bundle, created_by FROM vouchers LIMIT 0');
        $pdo->query('SELECT id, voucher_id, voucher_code, order_ref, member_id, buyer_email, customer_key, request_key, order_type, subtotal, discount_amount, final_amount, status, expires_at, used_at, released_at, voucher_snapshot, order_snapshot, release_reason FROM voucher_redemptions LIMIT 0');
        $ready[$connectionKey] = true;
        return;
    } catch (Throwable $error) {
        // Instalasi baru atau schema versi lama dilengkapi di bawah ini.
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS vouchers (
            id VARCHAR(120) PRIMARY KEY,
            code VARCHAR(60) NOT NULL,
            name VARCHAR(160) NOT NULL DEFAULT '',
            description TEXT,
            discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
            discount_value INT NOT NULL DEFAULT 0,
            max_discount INT NOT NULL DEFAULT 0,
            min_subtotal INT NOT NULL DEFAULT 0,
            starts_at DATETIME NULL,
            ends_at DATETIME NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            total_quota INT NOT NULL DEFAULT 0,
            per_customer_quota INT NOT NULL DEFAULT 0,
            target_type VARCHAR(40) NOT NULL DEFAULT 'all',
            eligible_items MEDIUMTEXT,
            combine_with_sale TINYINT(1) NOT NULL DEFAULT 0,
            combine_with_bundle TINYINT(1) NOT NULL DEFAULT 0,
            created_by VARCHAR(120) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY voucher_code_unique (code),
            INDEX voucher_status_time_index (status, starts_at, ends_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS voucher_redemptions (
            id VARCHAR(120) PRIMARY KEY,
            voucher_id VARCHAR(120) NOT NULL,
            voucher_code VARCHAR(60) NOT NULL DEFAULT '',
            order_ref VARCHAR(180) NOT NULL,
            member_id VARCHAR(120) NOT NULL DEFAULT '',
            buyer_email VARCHAR(180) NOT NULL DEFAULT '',
            customer_key VARCHAR(260) NOT NULL DEFAULT '',
            request_key VARCHAR(80) NOT NULL DEFAULT '',
            order_type VARCHAR(40) NOT NULL DEFAULT '',
            subtotal INT NOT NULL DEFAULT 0,
            discount_amount INT NOT NULL DEFAULT 0,
            final_amount INT NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'reserved',
            expires_at DATETIME NULL,
            used_at DATETIME NULL,
            released_at DATETIME NULL,
            voucher_snapshot MEDIUMTEXT,
            order_snapshot MEDIUMTEXT,
            release_reason VARCHAR(180) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY voucher_redemption_order_unique (order_ref),
            INDEX voucher_redemption_voucher_status_index (voucher_id, status),
            INDEX voucher_redemption_customer_index (voucher_id, customer_key, status),
            INDEX voucher_redemption_request_index (voucher_id, request_key, status),
            INDEX voucher_redemption_expiry_index (status, expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $voucherColumns = [
        'name' => "VARCHAR(160) NOT NULL DEFAULT ''",
        'description' => 'TEXT NULL',
        'discount_type' => "VARCHAR(20) NOT NULL DEFAULT 'percent'",
        'discount_value' => 'INT NOT NULL DEFAULT 0',
        'max_discount' => 'INT NOT NULL DEFAULT 0',
        'min_subtotal' => 'INT NOT NULL DEFAULT 0',
        'starts_at' => 'DATETIME NULL',
        'ends_at' => 'DATETIME NULL',
        'status' => "VARCHAR(20) NOT NULL DEFAULT 'draft'",
        'total_quota' => 'INT NOT NULL DEFAULT 0',
        'per_customer_quota' => 'INT NOT NULL DEFAULT 0',
        'target_type' => "VARCHAR(40) NOT NULL DEFAULT 'all'",
        'eligible_items' => 'MEDIUMTEXT NULL',
        'combine_with_sale' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'combine_with_bundle' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'created_by' => "VARCHAR(120) NOT NULL DEFAULT ''",
    ];
    foreach ($voucherColumns as $column => $definition) voucher_ensure_column($pdo, 'vouchers', $column, $definition);
    $redemptionColumns = [
        'member_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'buyer_email' => "VARCHAR(180) NOT NULL DEFAULT ''",
        'customer_key' => "VARCHAR(260) NOT NULL DEFAULT ''",
        'request_key' => "VARCHAR(80) NOT NULL DEFAULT ''",
        'order_type' => "VARCHAR(40) NOT NULL DEFAULT ''",
        'subtotal' => 'INT NOT NULL DEFAULT 0',
        'discount_amount' => 'INT NOT NULL DEFAULT 0',
        'final_amount' => 'INT NOT NULL DEFAULT 0',
        'status' => "VARCHAR(20) NOT NULL DEFAULT 'reserved'",
        'expires_at' => 'DATETIME NULL',
        'used_at' => 'DATETIME NULL',
        'released_at' => 'DATETIME NULL',
        'voucher_snapshot' => 'MEDIUMTEXT NULL',
        'order_snapshot' => 'MEDIUMTEXT NULL',
        'release_reason' => "VARCHAR(180) NOT NULL DEFAULT ''",
    ];
    foreach ($redemptionColumns as $column => $definition) voucher_ensure_column($pdo, 'voucher_redemptions', $column, $definition);
    $ready[$connectionKey] = true;
}

function voucher_clean_code($value): string
{
    return substr(preg_replace('/[^A-Z0-9_-]/', '', strtoupper(trim((string) $value))) ?? '', 0, 60);
}

function voucher_bool($value, bool $default = false): bool
{
    if ($value === null) return $default;
    if (is_bool($value)) return $value;
    if (is_numeric($value)) return (int) $value === 1;
    return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
}

function voucher_json_array($value): array
{
    if (is_array($value)) return $value;
    $decoded = json_decode((string) ($value ?? '[]'), true);
    return is_array($decoded) ? $decoded : [];
}

function voucher_datetime_to_db($value): ?string
{
    $value = trim((string) ($value ?? ''));
    if ($value === '') return null;
    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Throwable $error) {
        throw new VoucherException('Format waktu voucher tidak valid.', 'voucher_invalid_time');
    }
}

function voucher_datetime_public($value): ?string
{
    $value = trim((string) ($value ?? ''));
    if ($value === '') return null;
    return str_replace(' ', 'T', substr($value, 0, 19)) . 'Z';
}

function voucher_target_type($value): string
{
    $target = strtolower(clean_text($value ?? 'all', 40));
    $aliases = [
        'class' => 'classes',
        'course' => 'classes',
        'courses' => 'classes',
        'digital_product' => 'digital_products',
        'digital' => 'digital_products',
        'product' => 'digital_products',
        'products' => 'digital_products',
        'digital-products' => 'digital_products',
        'prompt' => 'prompts',
        'bundle' => 'bundles',
        'bundling' => 'bundles',
    ];
    $target = $aliases[$target] ?? $target;
    return in_array($target, ['all', 'classes', 'digital_products', 'prompts', 'bundles'], true)
        ? $target
        : 'all';
}

function voucher_normalize_eligible_items($value): array
{
    $result = [];
    foreach (array_slice(voucher_json_array($value), 0, 1000) as $item) {
        if (is_string($item)) {
            $raw = clean_text($item, 180);
            if ($raw === '') continue;
            $parts = explode(':', $raw, 2);
            $type = count($parts) === 2 ? voucher_target_type($parts[0]) : '';
            $id = count($parts) === 2 ? clean_text($parts[1], 120) : $raw;
        } elseif (is_array($item)) {
            $type = voucher_target_type($item['type'] ?? $item['targetType'] ?? 'all');
            $id = clean_text($item['id'] ?? $item['itemId'] ?? '', 120);
        } else {
            continue;
        }
        if ($id === '') continue;
        $key = ($type !== '' ? $type : 'all') . ':' . $id;
        $result[$key] = ['type' => $type ?: 'all', 'id' => $id];
    }
    return array_values($result);
}

function voucher_public(array $row, bool $includeStats = false): array
{
    $targetType = voucher_target_type($row['target_type'] ?? 'all');
    $scope = $targetType === 'digital_products' ? 'products' : $targetType;
    $targetItems = array_map(static function (array $item): array {
        $type = voucher_target_type($item['type'] ?? 'all');
        if ($type === 'classes') $type = 'class';
        elseif ($type === 'digital_products') $type = 'product';
        elseif ($type === 'prompts') $type = 'prompt';
        elseif ($type === 'bundles') $type = 'bundle';
        return ['type' => $type, 'id' => clean_text($item['id'] ?? '', 120)];
    }, voucher_normalize_eligible_items($row['eligible_items'] ?? []));
    $result = [
        'id' => clean_text($row['id'] ?? '', 120),
        'code' => voucher_clean_code($row['code'] ?? ''),
        'name' => clean_text($row['name'] ?? '', 160),
        'description' => clean_text($row['description'] ?? '', 2000),
        'discountType' => ($row['discount_type'] ?? '') === 'fixed' ? 'fixed' : 'percent',
        'discountValue' => (int) ($row['discount_value'] ?? 0),
        'maxDiscount' => (int) ($row['max_discount'] ?? 0),
        'minSubtotal' => (int) ($row['min_subtotal'] ?? 0),
        'minimumSubtotal' => (int) ($row['min_subtotal'] ?? 0),
        'startsAt' => voucher_datetime_public($row['starts_at'] ?? null),
        'endsAt' => voucher_datetime_public($row['ends_at'] ?? null),
        'status' => clean_text($row['status'] ?? 'draft', 20),
        'totalQuota' => (int) ($row['total_quota'] ?? 0),
        'perCustomerQuota' => (int) ($row['per_customer_quota'] ?? 0),
        'perUserQuota' => (int) ($row['per_customer_quota'] ?? 0),
        'targetType' => $targetType,
        'scope' => $scope,
        'eligibleItems' => voucher_normalize_eligible_items($row['eligible_items'] ?? []),
        'targetItems' => $targetItems,
        'combineWithSale' => (int) ($row['combine_with_sale'] ?? 0) === 1,
        'combineWithBundle' => (int) ($row['combine_with_bundle'] ?? 0) === 1,
        'createdAt' => voucher_datetime_public($row['created_at'] ?? null),
        'updatedAt' => voucher_datetime_public($row['updated_at'] ?? null),
    ];
    if ($includeStats) {
        $result['redeemedCount'] = (int) ($row['used_count'] ?? 0);
        $result['stats'] = [
            'reserved' => (int) ($row['reserved_count'] ?? 0),
            'used' => (int) ($row['used_count'] ?? 0),
            'released' => (int) ($row['released_count'] ?? 0),
            'expired' => (int) ($row['expired_count'] ?? 0),
            'discountGiven' => (int) ($row['discount_given'] ?? 0),
            'remainingQuota' => (int) ($row['total_quota'] ?? 0) > 0
                ? max(0, (int) $row['total_quota'] - (int) ($row['used_count'] ?? 0) - (int) ($row['reserved_count'] ?? 0))
                : null,
        ];
    }
    return $result;
}

function voucher_expire_reservations(PDO $pdo): int
{
    voucher_ensure_schema($pdo);
    $query = $pdo->prepare(
        "UPDATE voucher_redemptions
         SET status = 'expired', released_at = UTC_TIMESTAMP(), release_reason = 'reservation_expired'
         WHERE status = 'reserved' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP()"
    );
    $query->execute();
    return $query->rowCount();
}

function voucher_effective_price(array $row): array
{
    $price = clean_number($row['price'] ?? 0, 0, 1000000000);
    $sale = clean_number($row['sale_price'] ?? 0, 0, 1000000000);
    $onSale = $sale > 0;
    return ['amount' => $onSale ? $sale : $price, 'regular' => $price, 'onSale' => $onSale];
}

function voucher_member_from_identity(PDO $pdo, ?array $currentUser, string $email): ?array
{
    if (($currentUser['role'] ?? '') === 'member' && clean_text($currentUser['userId'] ?? '', 120) !== '') {
        $query = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
        $query->execute([clean_text($currentUser['userId'], 120), 'member']);
        return $query->fetch() ?: null;
    }
    if ($email !== '') {
        $query = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
        $query->execute(['member', $email]);
        return $query->fetch() ?: null;
    }
    return null;
}

function voucher_context_from_request(PDO $pdo, array $input, ?array $currentUser = null): array
{
    $orderType = strtolower(clean_text($input['orderType'] ?? '', 40));
    $classId = clean_text($input['classId'] ?? '', 120);
    $productId = clean_text($input['productId'] ?? '', 120);
    $bundleProgramId = clean_text($input['bundleProgramId'] ?? '', 120);
    $itemType = strtolower(clean_text($input['itemType'] ?? '', 40));
    $itemId = clean_text($input['itemId'] ?? '', 120);
    if ($classId === '' && in_array($itemType, ['class', 'course', 'public_class'], true)) $classId = $itemId;
    if ($productId === '' && in_array($itemType, ['product', 'digital', 'digital_product', 'prompt'], true)) $productId = $itemId;
    if ($orderType === '' && $itemType !== '') $orderType = $itemType;
    if ($orderType === '') {
        $orderType = $bundleProgramId !== '' ? 'bundle' : ($productId !== '' ? 'digital_product' : 'class');
    }
    $buyerEmail = clean_email($input['buyerEmail'] ?? ($currentUser['email'] ?? ''));
    $member = voucher_member_from_identity($pdo, $currentUser, $buyerEmail);
    $memberId = clean_text($member['id'] ?? '', 120);

    if (in_array($orderType, ['class', 'public_class'], true)) {
        if ($classId === '') throw new VoucherException('ID kelas wajib dikirim.', 'voucher_context_invalid');
        $query = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1');
        $query->execute([$classId, 'Aktif']);
        $item = $query->fetch();
        if (!$item) throw new VoucherException('Kelas aktif tidak ditemukan.', 'voucher_item_not_found', 404);
        if ($member && function_exists('clean_allowed_class_ids')) {
            $ownedClassIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);
            if (is_array($ownedClassIds) && in_array($classId, $ownedClassIds, true)) {
                throw new VoucherException('Kelas ini sudah tersedia di akun Anda.', 'voucher_item_owned');
            }
        }
        $price = voucher_effective_price($item);
        return [
            'orderType' => 'class', 'targetType' => 'classes', 'primaryId' => $classId,
            'subtotal' => $price['amount'], 'originalSubtotal' => $price['regular'],
            'hasSale' => $price['onSale'], 'hasBundleDiscount' => false,
            'memberId' => $memberId, 'buyerEmail' => $buyerEmail,
            'items' => [['type' => 'classes', 'id' => $classId, 'title' => clean_text($item['title'] ?? '', 180), 'price' => $price['amount']]],
        ];
    }

    if (in_array($orderType, ['digital_product', 'product', 'prompt'], true)) {
        if ($productId === '') throw new VoucherException('ID produk wajib dikirim.', 'voucher_context_invalid');
        $query = $pdo->prepare('SELECT * FROM digital_products WHERE id = ? AND status = ? LIMIT 1');
        $query->execute([$productId, 'Aktif']);
        $item = $query->fetch();
        if (!$item) throw new VoucherException('Produk digital aktif tidak ditemukan.', 'voucher_item_not_found', 404);
        if ($member && empty($item['allow_repeat_purchase'])) {
            $access = $pdo->prepare('SELECT id FROM digital_product_access WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?) LIMIT 1');
            $access->execute([$productId, 'active', $memberId, $buyerEmail]);
            if ($access->fetch()) {
                throw new VoucherException('Produk ini sudah tersedia di akun Anda.', 'voucher_item_owned');
            }
        }
        $isPrompt = clean_text($item['product_type'] ?? '', 40) === 'prompt';
        $price = voucher_effective_price($item);
        $targetType = $isPrompt ? 'prompts' : 'digital_products';
        return [
            'orderType' => $isPrompt ? 'prompt' : 'digital_product', 'targetType' => $targetType, 'primaryId' => $productId,
            'subtotal' => $price['amount'], 'originalSubtotal' => $price['regular'],
            'hasSale' => $price['onSale'], 'hasBundleDiscount' => false,
            'memberId' => $memberId, 'buyerEmail' => $buyerEmail,
            'items' => [['type' => $targetType, 'id' => $productId, 'title' => clean_text($item['title'] ?? '', 180), 'price' => $price['amount']]],
        ];
    }

    if ($orderType !== 'bundle' || $bundleProgramId === '') {
        throw new VoucherException('Jenis checkout voucher tidak didukung.', 'voucher_context_invalid');
    }
    $settings = fetch_website_settings($pdo);
    $rules = is_array($settings['bundling'] ?? null) ? $settings['bundling'] : [];
    if (empty($rules['enabled'])) throw new VoucherException('Program bundling sedang tidak aktif.', 'voucher_bundle_inactive');
    $program = null;
    foreach (($rules['programs'] ?? []) as $candidate) {
        if (($candidate['id'] ?? '') === $bundleProgramId && !empty($candidate['active'])) { $program = $candidate; break; }
    }
    if (!$program) throw new VoucherException('Program bundling tidak ditemukan atau tidak aktif.', 'voucher_item_not_found', 404);
    $requested = is_array($input['bundleItems'] ?? null) ? $input['bundleItems'] : [];
    if (($program['priceMode'] ?? '') === 'fixed') $requested = is_array($program['eligibleItems'] ?? null) ? $program['eligibleItems'] : [];
    $eligible = [];
    foreach (($program['eligibleItems'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $type = clean_text($item['type'] ?? '', 40); $id = clean_text($item['id'] ?? '', 120);
        if ($type !== '' && $id !== '') $eligible[$type . ':' . $id] = true;
    }
    $items = []; $seen = []; $subtotal = 0; $originalSubtotal = 0; $hasSale = false;
    foreach (array_slice($requested, 0, 50) as $requestedItem) {
        if (!is_array($requestedItem)) continue;
        $type = clean_text($requestedItem['type'] ?? '', 40); $id = clean_text($requestedItem['id'] ?? '', 120); $key = $type . ':' . $id;
        if ($id === '' || isset($seen[$key]) || empty($eligible[$key])) continue;
        $seen[$key] = true;
        if ($type === 'class') {
            if (empty($rules['allowClasses'])) continue;
            if ($member && function_exists('clean_allowed_class_ids') && in_array($id, clean_allowed_class_ids($member['allowed_class_ids'] ?? null) ?: [], true)) continue;
            $query = $pdo->prepare('SELECT * FROM classes WHERE id = ? AND status = ? LIMIT 1'); $query->execute([$id, 'Aktif']); $item = $query->fetch();
            if (!$item) continue;
            $price = voucher_effective_price($item); $hasSale = $hasSale || $price['onSale'];
            $subtotal += $price['amount']; $originalSubtotal += $price['regular'];
            $items[] = ['type' => 'classes', 'id' => $id, 'title' => clean_text($item['title'] ?? '', 180), 'price' => $price['amount']];
        } elseif ($type === 'digital_product') {
            $query = $pdo->prepare('SELECT * FROM digital_products WHERE id = ? AND status = ? LIMIT 1'); $query->execute([$id, 'Aktif']); $item = $query->fetch();
            if (!$item) continue;
            $isPrompt = clean_text($item['product_type'] ?? '', 40) === 'prompt';
            if (($isPrompt && empty($rules['allowPrompts'])) || (!$isPrompt && empty($rules['allowDigitalProducts']))) continue;
            if ($member) {
                $access = $pdo->prepare('SELECT id FROM digital_product_access WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?) LIMIT 1');
                $access->execute([$id, 'active', $memberId, $buyerEmail]);
                if ($access->fetch() && empty($item['allow_repeat_purchase'])) continue;
            }
            $price = voucher_effective_price($item); $hasSale = $hasSale || $price['onSale'];
            $subtotal += $price['amount']; $originalSubtotal += $price['regular'];
            $items[] = ['type' => $isPrompt ? 'prompts' : 'digital_products', 'id' => $id, 'title' => clean_text($item['title'] ?? '', 180), 'price' => $price['amount']];
        }
    }
    $minimum = ($program['priceMode'] ?? '') === 'fixed' ? 1 : clean_number($program['minimumItems'] ?? 1, 1, 50);
    if (count($items) < $minimum) throw new VoucherException('Item bundling yang memenuhi syarat belum cukup.', 'voucher_bundle_items_invalid');
    if ($subtotal < clean_number($rules['minimumSubtotal'] ?? 0, 0, 1000000000)) throw new VoucherException('Subtotal bundling belum memenuhi batas minimal.', 'voucher_bundle_minimum_not_met');
    $bundleDiscount = ($program['priceMode'] ?? '') === 'fixed'
        ? max(0, $subtotal - clean_number($program['fixedPrice'] ?? 0, 0, 1000000000))
        : (int) round($subtotal * clean_number($program['discountPercent'] ?? 0, 0, 100) / 100);
    $maximum = clean_number($program['maximumDiscount'] ?? 0, 0, 1000000000);
    if ($maximum > 0) $bundleDiscount = min($bundleDiscount, $maximum);
    return [
        'orderType' => 'bundle', 'targetType' => 'bundles', 'primaryId' => $bundleProgramId,
        'subtotal' => max(0, $subtotal - $bundleDiscount), 'originalSubtotal' => $originalSubtotal,
        'hasSale' => $hasSale, 'hasBundleDiscount' => $bundleDiscount > 0,
        'bundleSubtotal' => $subtotal, 'bundleDiscount' => $bundleDiscount,
        'memberId' => $memberId, 'buyerEmail' => $buyerEmail, 'items' => $items,
    ];
}

function voucher_customer_key(array $context): string
{
    $memberId = clean_text($context['memberId'] ?? '', 120);
    if ($memberId !== '') return 'member:' . $memberId;
    $email = clean_email($context['buyerEmail'] ?? '');
    if ($email === '') throw new VoucherException('Email pembeli diperlukan untuk batas penggunaan voucher.', 'voucher_identity_required');
    return 'email:' . $email;
}

function voucher_request_key(): string
{
    $ip = clean_text($_SERVER['REMOTE_ADDR'] ?? '', 100);
    return $ip !== '' ? hash('sha256', 'voucher-ip|' . $ip) : '';
}

function voucher_find(PDO $pdo, string $code, bool $forUpdate = false): ?array
{
    $query = $pdo->prepare('SELECT * FROM vouchers WHERE code = ? LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''));
    $query->execute([voucher_clean_code($code)]);
    return $query->fetch() ?: null;
}

function voucher_scope_matches(array $voucher, array $context): bool
{
    $target = voucher_target_type($voucher['target_type'] ?? 'all');
    $contextTarget = voucher_target_type($context['targetType'] ?? 'all');
    if ($target !== 'all' && $target !== $contextTarget) return false;
    $eligible = voucher_normalize_eligible_items($voucher['eligible_items'] ?? []);
    if (!$eligible) return true;
    $keys = [];
    $primaryId = clean_text($context['primaryId'] ?? '', 120);
    if ($primaryId !== '') {
        $keys[$contextTarget . ':' . $primaryId] = true;
        $keys['all:' . $primaryId] = true;
    }
    foreach (($context['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $type = voucher_target_type($item['type'] ?? 'all'); $id = clean_text($item['id'] ?? '', 120);
        if ($id !== '') { $keys[$type . ':' . $id] = true; $keys['all:' . $id] = true; }
    }
    foreach ($eligible as $item) {
        if (isset($keys[voucher_target_type($item['type']) . ':' . $item['id']])) return true;
    }
    return false;
}

function voucher_calculate_row(PDO $pdo, array $voucher, array $context, bool $checkQuota = true): array
{
    if (($voucher['status'] ?? '') !== 'active') throw new VoucherException('Voucher sedang tidak aktif.', 'voucher_inactive');
    $now = time();
    $starts = !empty($voucher['starts_at']) ? strtotime($voucher['starts_at'] . ' UTC') : false;
    $ends = !empty($voucher['ends_at']) ? strtotime($voucher['ends_at'] . ' UTC') : false;
    if ($starts !== false && $now < $starts) throw new VoucherException('Voucher belum mulai berlaku.', 'voucher_not_started');
    if ($ends !== false && $now > $ends) throw new VoucherException('Masa berlaku voucher sudah berakhir.', 'voucher_expired');
    if (!voucher_scope_matches($voucher, $context)) throw new VoucherException('Voucher tidak berlaku untuk item ini.', 'voucher_scope_mismatch');
    if (!voucher_bool($voucher['combine_with_sale'] ?? 0) && !empty($context['hasSale'])) throw new VoucherException('Voucher tidak dapat digabung dengan harga promo.', 'voucher_sale_not_combinable');
    if (!voucher_bool($voucher['combine_with_bundle'] ?? 0) && (!empty($context['hasBundleDiscount']) || ($context['orderType'] ?? '') === 'bundle')) throw new VoucherException('Voucher tidak dapat digabung dengan paket bundling.', 'voucher_bundle_not_combinable');
    $subtotal = clean_number($context['subtotal'] ?? 0, 0, 1000000000);
    if ($subtotal < (int) ($voucher['min_subtotal'] ?? 0)) throw new VoucherException('Subtotal belum memenuhi minimum penggunaan voucher.', 'voucher_minimum_not_met');
    if ($subtotal <= 0) throw new VoucherException('Voucher tidak diperlukan untuk pesanan gratis.', 'voucher_zero_subtotal');
    $customerKey = voucher_customer_key($context);
    if ($checkQuota) {
        $activeSql = "status = 'used' OR (status = 'reserved' AND (expires_at IS NULL OR expires_at >= UTC_TIMESTAMP()))";
        $total = $pdo->prepare("SELECT COUNT(*) FROM voucher_redemptions WHERE voucher_id = ? AND ($activeSql)");
        $total->execute([$voucher['id']]);
        if ((int) ($voucher['total_quota'] ?? 0) > 0 && (int) $total->fetchColumn() >= (int) $voucher['total_quota']) throw new VoucherException('Kuota voucher sudah habis.', 'voucher_quota_exhausted');
        $perCustomer = $pdo->prepare(
            "SELECT COUNT(*) FROM voucher_redemptions
             WHERE voucher_id = ?
             AND (customer_key = ? OR (? <> '' AND member_id = ?) OR (? <> '' AND buyer_email = ?))
             AND ($activeSql)"
        );
        $memberId = clean_text($context['memberId'] ?? '', 120);
        $buyerEmail = clean_email($context['buyerEmail'] ?? '');
        $perCustomer->execute([$voucher['id'], $customerKey, $memberId, $memberId, $buyerEmail, $buyerEmail]);
        if ((int) ($voucher['per_customer_quota'] ?? 0) > 0 && (int) $perCustomer->fetchColumn() >= (int) $voucher['per_customer_quota']) throw new VoucherException('Batas penggunaan voucher untuk akun/email ini sudah tercapai.', 'voucher_customer_quota_exhausted');
    }
    $discount = ($voucher['discount_type'] ?? '') === 'fixed'
        ? (int) ($voucher['discount_value'] ?? 0)
        : (int) round($subtotal * (int) ($voucher['discount_value'] ?? 0) / 100);
    $maxDiscount = (int) ($voucher['max_discount'] ?? 0);
    if ($maxDiscount > 0) $discount = min($discount, $maxDiscount);
    $discount = min($subtotal, max(0, $discount));
    if ($discount <= 0) throw new VoucherException('Voucher tidak menghasilkan potongan untuk pesanan ini.', 'voucher_no_discount');
    return [
        'valid' => true, 'voucherId' => $voucher['id'], 'code' => $voucher['code'],
        'name' => $voucher['name'], 'discountType' => $voucher['discount_type'],
        'discountValue' => (int) $voucher['discount_value'], 'maxDiscount' => (int) $voucher['max_discount'],
        'subtotal' => $subtotal, 'discountAmount' => $discount, 'finalAmount' => max(0, $subtotal - $discount),
        'customerKey' => $customerKey, 'context' => $context,
    ];
}

function voucher_calculate(PDO $pdo, string $code, array $context, bool $checkQuota = true): array
{
    voucher_ensure_schema($pdo);
    if ($checkQuota) voucher_expire_reservations($pdo);
    $cleanCode = voucher_clean_code($code);
    if ($cleanCode === '') throw new VoucherException('Masukkan kode voucher.', 'voucher_code_required');
    $voucher = voucher_find($pdo, $cleanCode);
    if (!$voucher) throw new VoucherException('Kode voucher tidak ditemukan.', 'voucher_not_found', 404);
    return voucher_calculate_row($pdo, $voucher, $context, $checkQuota);
}

function voucher_snapshot(array $calculation): array
{
    return [
        'id' => clean_text($calculation['voucherId'] ?? '', 120),
        'code' => voucher_clean_code($calculation['code'] ?? ''),
        'name' => clean_text($calculation['name'] ?? '', 160),
        'discountType' => ($calculation['discountType'] ?? '') === 'fixed' ? 'fixed' : 'percent',
        'discountValue' => (int) ($calculation['discountValue'] ?? 0),
        'maxDiscount' => (int) ($calculation['maxDiscount'] ?? 0),
        'subtotal' => (int) ($calculation['subtotal'] ?? 0),
        'discountAmount' => (int) ($calculation['discountAmount'] ?? 0),
        'finalAmount' => (int) ($calculation['finalAmount'] ?? 0),
    ];
}

function voucher_reserve(PDO $pdo, string $code, array $context, string $orderRef, $expiresAt): array
{
    voucher_ensure_schema($pdo);
    voucher_expire_reservations($pdo);
    $orderRef = clean_text($orderRef, 180);
    if ($orderRef === '') throw new VoucherException('Referensi order voucher wajib tersedia.', 'voucher_order_ref_required');
    $expires = is_int($expiresAt) ? gmdate('Y-m-d H:i:s', $expiresAt) : voucher_datetime_to_db($expiresAt);
    if ($expires === null || strtotime($expires . ' UTC') <= time()) throw new VoucherException('Waktu reservasi voucher tidak valid.', 'voucher_reservation_expiry_invalid');
    $ownsTransaction = !$pdo->inTransaction();
    try {
        if ($ownsTransaction) $pdo->beginTransaction();
        $existing = $pdo->prepare('SELECT * FROM voucher_redemptions WHERE order_ref = ? LIMIT 1 FOR UPDATE');
        $existing->execute([$orderRef]);
        $existingRow = $existing->fetch();
        if ($existingRow) {
            if (!in_array($existingRow['status'], ['reserved', 'used'], true)) throw new VoucherException('Reservasi voucher order ini sudah dilepas.', 'voucher_reservation_released');
            $snapshot = voucher_json_array($existingRow['voucher_snapshot'] ?? []);
            if ($ownsTransaction) $pdo->commit();
            return array_merge(['valid' => true, 'reservationId' => $existingRow['id'], 'reservationStatus' => $existingRow['status']], $snapshot);
        }
        $voucher = voucher_find($pdo, $code, true);
        if (!$voucher) throw new VoucherException('Kode voucher tidak ditemukan.', 'voucher_not_found', 404);
        $calculation = voucher_calculate_row($pdo, $voucher, $context, true);
        $requestKey = voucher_request_key();
        if ($requestKey !== '') {
            $requestCount = $pdo->prepare(
                "SELECT COUNT(*) FROM voucher_redemptions
                 WHERE voucher_id = ? AND request_key = ?
                 AND status = 'reserved'
                 AND (expires_at IS NULL OR expires_at >= UTC_TIMESTAMP())"
            );
            $requestCount->execute([$voucher['id'], $requestKey]);
            if ((int) $requestCount->fetchColumn() >= 5) {
                throw new VoucherException('Terlalu banyak checkout voucher aktif dari koneksi ini. Selesaikan atau tunggu invoice sebelumnya berakhir.', 'voucher_checkout_rate_limited', 429);
            }
        }
        $snapshot = voucher_snapshot($calculation);
        $insert = $pdo->prepare(
            'INSERT INTO voucher_redemptions
             (id, voucher_id, voucher_code, order_ref, member_id, buyer_email, customer_key, request_key, order_type, subtotal, discount_amount, final_amount, status, expires_at, voucher_snapshot, order_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $reservationId = make_id('voucher-use');
        $insert->execute([
            $reservationId, $voucher['id'], $voucher['code'], $orderRef,
            clean_text($context['memberId'] ?? '', 120), clean_email($context['buyerEmail'] ?? ''), $calculation['customerKey'],
            $requestKey, clean_text($context['orderType'] ?? '', 40), $calculation['subtotal'], $calculation['discountAmount'], $calculation['finalAmount'],
            'reserved', $expires, json_encode($snapshot, JSON_UNESCAPED_UNICODE), json_encode($context, JSON_UNESCAPED_UNICODE),
        ]);
        if ($ownsTransaction) $pdo->commit();
        return array_merge($calculation, ['reservationId' => $reservationId, 'reservationStatus' => 'reserved']);
    } catch (Throwable $error) {
        if ($ownsTransaction && $pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function voucher_mark_used(PDO $pdo, string $orderRef): bool
{
    voucher_ensure_schema($pdo);
    $query = $pdo->prepare(
        "UPDATE voucher_redemptions SET
            release_reason = CASE WHEN status = 'reserved' THEN '' ELSE CONCAT('paid_after_', status) END,
            status = 'used', used_at = COALESCE(used_at, UTC_TIMESTAMP()), expires_at = NULL, released_at = NULL
         WHERE order_ref = ? AND status IN ('reserved', 'expired', 'released')"
    );
    $query->execute([clean_text($orderRef, 180)]);
    if ($query->rowCount() > 0) return true;
    $check = $pdo->prepare("SELECT id FROM voucher_redemptions WHERE order_ref = ? AND status = 'used' LIMIT 1");
    $check->execute([clean_text($orderRef, 180)]);
    return (bool) $check->fetch();
}

function voucher_release(PDO $pdo, string $orderRef, string $reason = 'checkout_failed'): bool
{
    voucher_ensure_schema($pdo);
    $query = $pdo->prepare(
        "UPDATE voucher_redemptions SET status = 'released', released_at = COALESCE(released_at, UTC_TIMESTAMP()), release_reason = ?
         WHERE order_ref = ? AND status = 'reserved'"
    );
    $query->execute([clean_text($reason, 180), clean_text($orderRef, 180)]);
    return $query->rowCount() > 0;
}
