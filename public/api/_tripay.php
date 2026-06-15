<?php

declare(strict_types=1);

function tripay_ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    try {
        $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $query->execute([$column]);

        if (!$query->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD `$column` $definition");
        }
    } catch (Throwable $error) {
        // Installer can add blocked runtime columns.
    }
}

function tripay_ensure_schema(PDO $pdo): void
{
    tripay_ensure_column($pdo, 'classes', 'price', 'INT NOT NULL DEFAULT 0 AFTER revenue');
    tripay_ensure_column($pdo, 'classes', 'tripay_product_key', "VARCHAR(180) NOT NULL DEFAULT '' AFTER lynk_product_key");

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS tripay_orders (
            id VARCHAR(120) PRIMARY KEY,
            merchant_ref VARCHAR(180) NOT NULL DEFAULT '',
            reference VARCHAR(180) NOT NULL DEFAULT '',
            member_id VARCHAR(120) NOT NULL DEFAULT '',
            buyer_name VARCHAR(160) NOT NULL DEFAULT '',
            buyer_email VARCHAR(180) NOT NULL DEFAULT '',
            class_id VARCHAR(120) NOT NULL DEFAULT '',
            class_title VARCHAR(160) NOT NULL DEFAULT '',
            amount INT NOT NULL DEFAULT 0,
            status VARCHAR(40) NOT NULL DEFAULT 'pending',
            checkout_url MEDIUMTEXT,
            access_granted TINYINT(1) NOT NULL DEFAULT 0,
            payload MEDIUMTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY tripay_merchant_ref_unique (merchant_ref),
            INDEX tripay_reference_index (reference),
            INDEX tripay_member_index (member_id),
            INDEX tripay_class_index (class_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
}

function tripay_api_base_url(array $config): string
{
    return !empty($config['tripay_is_production'])
        ? 'https://tripay.co.id/api'
        : 'https://tripay.co.id/api-sandbox';
}

function tripay_origin(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = clean_text($_SERVER['HTTP_HOST'] ?? '', 180);

    return $host !== '' ? $scheme . '://' . $host : '';
}

function tripay_absolute_url(string $path): string
{
    $origin = tripay_origin();

    return $origin !== '' ? $origin . $path : '';
}

function tripay_config_value(array $config, string $key, int $maxLength = 240): string
{
    return clean_text($config[$key] ?? '', $maxLength);
}

function tripay_assert_config(array $config): void
{
    if (
        tripay_config_value($config, 'tripay_merchant_code') === '' ||
        tripay_config_value($config, 'tripay_api_key', 300) === '' ||
        tripay_config_value($config, 'tripay_private_key', 300) === ''
    ) {
        send_json(500, ['message' => 'Konfigurasi Tripay belum lengkap di config website.']);
    }
}

function tripay_checkout_signature(string $merchantCode, string $merchantRef, int $amount, string $privateKey): string
{
    return hash_hmac('sha256', $merchantCode . $merchantRef . $amount, $privateKey);
}

function tripay_callback_signature(string $rawBody, string $privateKey): string
{
    return hash_hmac('sha256', $rawBody, $privateKey);
}

function tripay_post_transaction(array $config, array $payload): array
{
    if (!function_exists('curl_init')) {
        send_json(500, ['message' => 'Ekstensi cURL PHP belum aktif untuk menghubungi Tripay.']);
    }

    $curl = curl_init(tripay_api_base_url($config) . '/transaction/create');

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . tripay_config_value($config, 'tripay_api_key', 300),
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
            'User-Agent: ibnucreative-tripay-checkout',
        ],
        CURLOPT_POSTFIELDS => http_build_query($payload),
        CURLOPT_TIMEOUT => 30,
    ]);

    $body = curl_exec($curl);
    $error = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    curl_close($curl);

    if ($body === false || $error !== '') {
        send_json(502, ['message' => 'Koneksi ke Tripay gagal.']);
    }

    $data = json_decode((string) $body, true);
    $data = is_array($data) ? $data : [];

    if ($status < 200 || $status >= 300 || ($data['success'] ?? true) === false) {
        send_json($status >= 400 ? $status : 502, [
            'message' => clean_text($data['message'] ?? $data['error'] ?? 'Checkout Tripay gagal dibuat.', 240),
        ]);
    }

    return [
        'body' => (string) $body,
        'data' => $data,
    ];
}

function tripay_has_class_access(array $member, string $classId): bool
{
    $classIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);

    return $classIds === null || in_array($classId, $classIds, true);
}

function tripay_grant_class_access(PDO $pdo, string $memberId, string $classId): bool
{
    $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
    $memberQuery->execute([$memberId, 'member']);
    $member = $memberQuery->fetch();

    if (!$member) {
        send_json(404, ['message' => 'Member pembeli tidak ditemukan.']);
    }

    $currentClassIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);

    if ($currentClassIds === null || in_array($classId, $currentClassIds, true)) {
        return false;
    }

    $mergedClassIds = array_values(array_unique(array_merge($currentClassIds, [$classId])));
    $updateMember = $pdo->prepare(
        'UPDATE accounts SET status = ?, allowed_class_ids = ? WHERE id = ? AND role = ?',
    );
    $updateMember->execute([
        'Aktif',
        json_encode($mergedClassIds, JSON_UNESCAPED_UNICODE),
        $memberId,
        'member',
    ]);

    $updateClass = $pdo->prepare('UPDATE classes SET students = students + 1 WHERE id = ?');
    $updateClass->execute([$classId]);

    return true;
}

function tripay_nested_value(array $payload, string $path)
{
    $current = $payload;

    foreach (explode('.', $path) as $segment) {
        if (!is_array($current) || !array_key_exists($segment, $current)) {
            return null;
        }

        $current = $current[$segment];
    }

    return $current;
}

function tripay_first_value(array $payload, array $paths): string
{
    foreach ($paths as $path) {
        $value = tripay_nested_value($payload, $path);

        if ($value !== null && $value !== '') {
            return clean_text($value, 240);
        }
    }

    return '';
}

function tripay_is_paid(array $payload): bool
{
    $status = strtoupper(tripay_first_value($payload, ['status', 'data.status']));

    return $status === 'PAID' || tripay_first_value($payload, ['paid_at', 'data.paid_at']) !== '';
}
