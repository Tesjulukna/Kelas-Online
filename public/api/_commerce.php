<?php

declare(strict_types=1);

function commerce_json($value): array
{
    $decoded = json_decode((string) ($value ?? '{}'), true);

    return is_array($decoded) ? $decoded : [];
}

function commerce_flag_enabled($value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_numeric($value)) {
        return (int) $value === 1;
    }

    $normalized = strtolower(trim((string) $value));

    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
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

function commerce_public_product_access_url(string $orderCode, string $productType = ''): string
{
    $code = clean_text($orderCode, 180);
    $path = clean_text($productType, 40) === 'prompt' ? '/prompt-akses/' : '/produk-akses/';

    return $code !== '' ? tripay_absolute_url($path . rawurlencode($code)) : '';
}

function commerce_login_url(array $config): string
{
    $configured = clean_external_url($config['site_login_url'] ?? '');

    if ($configured !== '') {
        return $configured;
    }

    return tripay_absolute_url('/login') ?: '/login';
}

function commerce_generated_password(string $email, array $config): string
{
    $secret = tripay_config_value($config, 'tripay_private_key', 300)
        ?: clean_text($config['lynk_webhook_secret'] ?? '', 300)
        ?: 'ibnucreative-public-class';

    return 'IC-' . substr(hash_hmac('sha256', strtolower($email), $secret), 0, 10);
}

function commerce_unique_username(PDO $pdo, string $email, string $name): string
{
    $base = clean_username(strtok($email, '@') ?: $name);
    $base = $base !== '' ? $base : 'member';
    $username = $base;
    $counter = 2;
    $query = $pdo->prepare('SELECT id FROM accounts WHERE role = ? AND username = ? LIMIT 1');

    while (true) {
        $query->execute(['member', $username]);

        if (!$query->fetch()) {
            return $username;
        }

        $username = $base . $counter;
        $counter++;
    }
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

function commerce_product_stock_managed(array $product): bool
{
    return commerce_flag_enabled($product['item_quantity_enabled'] ?? 0);
}

function commerce_product_stock_count(array $product): int
{
    return clean_number($product['item_quantity'] ?? 0, 0, 1000000000);
}

function commerce_product_sold_out(array $product): bool
{
    return commerce_product_stock_managed($product) && commerce_product_stock_count($product) <= 0;
}

function commerce_assert_product_stock_available(array $product): void
{
    if (commerce_product_sold_out($product)) {
        send_json(409, [
            'message' => 'Stok produk habis. Silakan hubungi admin atau pilih produk lain.',
        ]);
    }
}

function commerce_decrement_product_stock(PDO $pdo, string $productId): void
{
    $id = clean_text($productId, 120);

    if ($id === '') {
        return;
    }

    $update = $pdo->prepare(
        'UPDATE digital_products
        SET item_quantity = GREATEST(item_quantity - 1, 0), updated_at = NOW()
        WHERE id = ? AND item_quantity_enabled = 1 AND item_quantity > 0'
    );
    $update->execute([$id]);
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
        $query = $pdo->prepare('SELECT * FROM digital_product_access WHERE order_id = ? AND status = ? LIMIT 1');
        $query->execute([$orderId, 'active']);
        $existing = $query->fetch();
    }

    if (!$existing && empty($product['allow_repeat_purchase']) && ($memberId !== '' || $buyerEmail !== '')) {
        $query = $pdo->prepare(
            'SELECT * FROM digital_product_access
            WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?)
            LIMIT 1',
        );
        $query->execute([$productId, 'active', $memberId, $buyerEmail]);
        $existing = $query->fetch();
    }

    if ($existing) {
        if ($memberId !== '' && empty($existing['member_id'])) {
            $update = $pdo->prepare(
                'UPDATE digital_product_access
                SET member_id = ?, buyer_name = ?
                WHERE id = ?',
            );
            $update->execute([
                $memberId,
                clean_text($args['buyerName'] ?? ($existing['buyer_name'] ?? 'Pelanggan'), 160),
                $existing['id'],
            ]);

            $query = $pdo->prepare('SELECT * FROM digital_product_access WHERE id = ? LIMIT 1');
            $query->execute([$existing['id']]);
            $existing = $query->fetch() ?: $existing;
        }

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

    if (!array_key_exists('decrementStock', $args) || $args['decrementStock'] !== false) {
        commerce_decrement_product_stock($pdo, $product['id']);
    }

    $query = $pdo->prepare('SELECT * FROM digital_product_access WHERE id = ? LIMIT 1');
    $query->execute([$accessId]);

    return [
        'granted' => true,
        'access' => $query->fetch(),
        'product' => $product,
    ];
}

function commerce_class_bundled_product_ids($value): array
{
    $ids = is_string($value) ? json_decode($value, true) : $value;

    if (!is_array($ids)) {
        return [];
    }

    return array_values(array_unique(array_filter(array_map(static function ($productId): string {
        return clean_text($productId, 120);
    }, array_slice($ids, 0, 300)))));
}

function commerce_grant_class_bundled_products(PDO $pdo, array $args): array
{
    $class = is_array($args['class'] ?? null) ? $args['class'] : [];
    $classId = clean_text($class['id'] ?? ($args['classId'] ?? ''), 120);

    if (!$class && $classId !== '') {
        $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
        $classQuery->execute([$classId]);
        $class = $classQuery->fetch() ?: [];
    }

    $productIds = commerce_class_bundled_product_ids($class['bundled_product_ids'] ?? []);
    $memberId = clean_text($args['memberId'] ?? '', 120);
    $buyerEmail = clean_email($args['buyerEmail'] ?? '');
    $buyerName = clean_text($args['buyerName'] ?? '', 160) ?: 'Peserta IbnuCreative';

    if (!$productIds || ($memberId === '' && $buyerEmail === '')) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($productIds), '?'));
    $productQuery = $pdo->prepare(
        "SELECT * FROM digital_products WHERE id IN ({$placeholders})",
    );
    $productQuery->execute($productIds);
    $productsById = [];

    foreach ($productQuery->fetchAll() as $product) {
        $productsById[$product['id']] = $product;
    }

    $bundleItems = [];
    $ownerKey = $memberId !== '' ? $memberId : $buyerEmail;

    foreach ($productIds as $productId) {
        $product = $productsById[$productId] ?? null;

        if (!$product) {
            continue;
        }

        $orderId = 'bundle-' . substr(hash('sha256', $classId . '|' . $productId . '|' . $ownerKey), 0, 40);

        if ($buyerEmail !== '') {
            $existingQuery = $pdo->prepare(
                'SELECT * FROM digital_product_access
                WHERE product_id = ? AND status = ? AND (member_id = ? OR buyer_email = ?)
                ORDER BY created_at ASC LIMIT 1',
            );
            $existingQuery->execute([$productId, 'active', $memberId, $buyerEmail]);
        } else {
            $existingQuery = $pdo->prepare(
                'SELECT * FROM digital_product_access
                WHERE product_id = ? AND status = ? AND member_id = ?
                ORDER BY created_at ASC LIMIT 1',
            );
            $existingQuery->execute([$productId, 'active', $memberId]);
        }

        $existingAccess = $existingQuery->fetch();

        if ($existingAccess) {
            $accessOrderId = clean_text($existingAccess['order_id'] ?? '', 180) ?: $orderId;
            $nextMemberId = clean_text($existingAccess['member_id'] ?? '', 120) ?: $memberId;
            $nextSource = strtolower(clean_text($existingAccess['source'] ?? '', 80)) === 'admin-manual'
                ? 'class-bundle'
                : clean_text($existingAccess['source'] ?? 'class-bundle', 80);
            $updateAccess = $pdo->prepare(
                'UPDATE digital_product_access
                SET member_id = ?, buyer_name = ?, buyer_email = ?, source = ?, order_id = ?
                WHERE id = ?',
            );
            $updateAccess->execute([
                $nextMemberId,
                $buyerName,
                $buyerEmail ?: clean_email($existingAccess['buyer_email'] ?? ''),
                $nextSource,
                $accessOrderId,
                $existingAccess['id'],
            ]);
            $existingAccess['member_id'] = $nextMemberId;
            $existingAccess['buyer_name'] = $buyerName;
            $existingAccess['buyer_email'] = $buyerEmail ?: ($existingAccess['buyer_email'] ?? '');
            $existingAccess['source'] = $nextSource;
            $existingAccess['order_id'] = $accessOrderId;
            $accessResult = [
                'granted' => false,
                'access' => $existingAccess,
                'product' => $product,
            ];
        } else {
            $accessResult = commerce_grant_digital_product_access($pdo, [
                'productId' => $productId,
                'memberId' => $memberId,
                'buyerEmail' => $buyerEmail,
                'buyerName' => $buyerName,
                'source' => 'class-bundle',
                'orderId' => $orderId,
                'decrementStock' => false,
            ]);
        }

        $accessOrderId = clean_text($accessResult['access']['order_id'] ?? $orderId, 180);
        $productType = clean_text($product['product_type'] ?? 'digital', 40) === 'prompt' ? 'prompt' : 'digital';
        $accessUrl = $accessOrderId !== ''
            ? commerce_public_product_access_url($accessOrderId, $productType)
            : clean_asset_url($product['file_url'] ?? '', 1000);

        $bundleItems[] = [
            'productId' => $productId,
            'productTitle' => clean_text($product['title'] ?? 'Produk digital', 180),
            'productType' => $productType,
            'accessOrderId' => $accessOrderId,
            'accessUrl' => $accessUrl,
            'deliveryNote' => clean_text($product['delivery_note'] ?? '', 1200),
            'granted' => !empty($accessResult['granted']),
        ];
    }

    return $bundleItems;
}

function commerce_grant_product_member_account(PDO $pdo, array $args, array $config): array
{
    $productId = clean_text($args['productId'] ?? '', 120);
    $product = commerce_fetch_product($pdo, $productId, false);

    if (!$product) {
        send_json(404, ['message' => 'Produk digital untuk aktivasi akun tidak ditemukan.']);
    }

    if (!commerce_flag_enabled($product['auto_create_member'] ?? 0)) {
        return [
            'enabled' => false,
            'member' => null,
            'product' => $product,
            'passwordCreated' => false,
            'password' => null,
            'loginUrl' => commerce_login_url($config),
        ];
    }

    $buyerEmail = clean_email($args['buyerEmail'] ?? '');
    $buyerName = clean_text($args['buyerName'] ?? '', 160) ?: 'Pelanggan IbnuCreative';
    $buyerPhone = clean_phone($args['buyerPhone'] ?? '');

    if ($buyerEmail === '') {
        send_json(422, ['message' => 'Email pembeli wajib tersedia untuk membuat akun produk digital.']);
    }

    $password = commerce_generated_password($buyerEmail, $config);
    $passwordCreated = false;
    $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
    $memberQuery->execute(['member', $buyerEmail]);
    $member = $memberQuery->fetch();

    if ($member) {
        $passwordHash = !empty($config['lynk_reset_existing_member_password'])
            ? hash_password_value($password)
            : $member['password_hash'];
        $passwordCreated = !empty($config['lynk_reset_existing_member_password']);
        $update = $pdo->prepare(
            'UPDATE accounts
            SET name = ?, phone = ?, status = ?, password_hash = ?
            WHERE id = ? AND role = ?',
        );
        $update->execute([
            $buyerName ?: ($member['name'] ?? 'Pelanggan IbnuCreative'),
            $buyerPhone ?: ($member['phone'] ?? ''),
            'Aktif',
            $passwordHash,
            $member['id'],
            'member',
        ]);
        $member['name'] = $buyerName ?: ($member['name'] ?? 'Pelanggan IbnuCreative');
        $member['phone'] = $buyerPhone ?: ($member['phone'] ?? '');
    } else {
        $member = [
            'id' => make_id('member'),
            'username' => commerce_unique_username($pdo, $buyerEmail, $buyerName),
            'name' => $buyerName,
            'email' => $buyerEmail,
        ];
        $passwordCreated = true;
        $insert = $pdo->prepare(
            'INSERT INTO accounts
            (id, role, name, username, email, phone, status, avatar, allowed_class_ids, password_hash, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $insert->execute([
            $member['id'],
            'member',
            $buyerName,
            $member['username'],
            $buyerEmail,
            $buyerPhone,
            'Aktif',
            '',
            json_encode([], JSON_UNESCAPED_UNICODE),
            hash_password_value($password),
            date('Y-m-d'),
        ]);
    }

    return [
        'enabled' => true,
        'member' => $member,
        'product' => $product,
        'passwordCreated' => $passwordCreated,
        'password' => $passwordCreated ? $password : null,
        'loginUrl' => commerce_login_url($config),
    ];
}

function commerce_grant_class_account_access(PDO $pdo, array $args, array $config): array
{
    $classId = clean_text($args['classId'] ?? '', 120);
    $buyerEmail = clean_email($args['buyerEmail'] ?? '');
    $buyerName = clean_text($args['buyerName'] ?? '', 160) ?: 'Peserta IbnuCreative';
    $buyerPhone = clean_phone($args['buyerPhone'] ?? '');

    if ($classId === '' || $buyerEmail === '') {
        send_json(422, ['message' => 'ID kelas dan email pembeli wajib tersedia untuk aktivasi akses.']);
    }

    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
    $classQuery->execute([$classId]);
    $class = $classQuery->fetch();

    if (!$class) {
        send_json(404, ['message' => 'Kelas untuk aktivasi akses tidak ditemukan.']);
    }

    $password = commerce_generated_password($buyerEmail, $config);
    $passwordCreated = false;
    $accessGranted = false;
    $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
    $memberQuery->execute(['member', $buyerEmail]);
    $member = $memberQuery->fetch();

    if ($member) {
        $currentClassIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);
        $currentClassIds = is_array($currentClassIds) ? $currentClassIds : [];
        $nextClassIds = $currentClassIds;

        if (!in_array($classId, $currentClassIds, true)) {
            $nextClassIds = array_values(array_unique(array_merge($currentClassIds, [$classId])));
            $accessGranted = true;
        }

        $passwordHash = !empty($config['lynk_reset_existing_member_password'])
            ? hash_password_value($password)
            : $member['password_hash'];
        $passwordCreated = !empty($config['lynk_reset_existing_member_password']);
        $update = $pdo->prepare(
            'UPDATE accounts
            SET name = ?, phone = ?, status = ?, allowed_class_ids = ?, password_hash = ?
            WHERE id = ? AND role = ?',
        );
        $update->execute([
            $buyerName ?: ($member['name'] ?? 'Peserta IbnuCreative'),
            $buyerPhone ?: ($member['phone'] ?? ''),
            'Aktif',
            json_encode($nextClassIds, JSON_UNESCAPED_UNICODE),
            $passwordHash,
            $member['id'],
            'member',
        ]);
        $member['name'] = $buyerName ?: ($member['name'] ?? 'Peserta IbnuCreative');
        $member['phone'] = $buyerPhone ?: ($member['phone'] ?? '');
        $member['allowed_class_ids'] = json_encode($nextClassIds, JSON_UNESCAPED_UNICODE);
    } else {
        $member = [
            'id' => make_id('member'),
            'username' => commerce_unique_username($pdo, $buyerEmail, $buyerName),
            'name' => $buyerName,
            'email' => $buyerEmail,
        ];
        $passwordCreated = true;
        $accessGranted = true;
        $insert = $pdo->prepare(
            'INSERT INTO accounts
            (id, role, name, username, email, phone, status, avatar, allowed_class_ids, password_hash, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $insert->execute([
            $member['id'],
            'member',
            $buyerName,
            $member['username'],
            $buyerEmail,
            $buyerPhone,
            'Aktif',
            '',
            json_encode([$classId], JSON_UNESCAPED_UNICODE),
            hash_password_value($password),
            date('Y-m-d'),
        ]);
    }

    if ($accessGranted) {
        $updateClass = $pdo->prepare('UPDATE classes SET students = COALESCE(students, 0) + 1 WHERE id = ?');
        $updateClass->execute([$classId]);
    }

    return [
        'member' => $member,
        'class' => $class,
        'accessGranted' => $accessGranted,
        'passwordCreated' => $passwordCreated,
        'password' => $passwordCreated ? $password : null,
        'loginUrl' => commerce_login_url($config),
    ];
}
