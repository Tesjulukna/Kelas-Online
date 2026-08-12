<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_vouchers.php';

ensure_method(['GET', 'POST', 'PUT', 'DELETE']);

$admin = require_user('admin');
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
voucher_ensure_schema($pdo);
voucher_expire_reservations($pdo);

function voucher_admin_payload(array $input): array
{
    $input = is_array($input['voucher'] ?? null) ? $input['voucher'] : $input;
    $discountType = strtolower(clean_text($input['discountType'] ?? $input['discount_type'] ?? 'percent', 20));
    $discountType = $discountType === 'fixed' ? 'fixed' : 'percent';
    $discountValue = clean_number($input['discountValue'] ?? $input['discount_value'] ?? 0, 0, 1000000000);
    if ($discountType === 'percent') $discountValue = min(100, $discountValue);
    if ($discountValue <= 0) throw new VoucherException('Nilai potongan voucher harus lebih dari 0.', 'voucher_discount_required');
    $status = strtolower(clean_text($input['status'] ?? 'draft', 20));
    if (!in_array($status, ['active', 'draft', 'paused', 'archived'], true)) $status = 'draft';
    $startsAt = voucher_datetime_to_db($input['startsAt'] ?? $input['starts_at'] ?? null);
    $endsAt = voucher_datetime_to_db($input['endsAt'] ?? $input['ends_at'] ?? null);
    if ($startsAt !== null && $endsAt !== null && $endsAt <= $startsAt) {
        throw new VoucherException('Waktu berakhir harus setelah waktu mulai.', 'voucher_time_range_invalid');
    }
    $code = voucher_clean_code($input['code'] ?? '');
    if (strlen($code) < 3) throw new VoucherException('Kode voucher minimal 3 karakter.', 'voucher_code_invalid');
    $targetType = voucher_target_type($input['scope'] ?? $input['targetType'] ?? $input['target_type'] ?? 'all');
    $eligibleItems = voucher_normalize_eligible_items($input['targetItems'] ?? $input['target_items'] ?? $input['eligibleItems'] ?? $input['eligible_items'] ?? []);
    if ($targetType === 'all') {
        $eligibleItems = [];
    } else {
        $eligibleItems = array_values(array_filter($eligibleItems, static function (array $item) use ($targetType): bool {
            return voucher_target_type($item['type'] ?? '') === $targetType;
        }));
        if (!$eligibleItems) {
            throw new VoucherException('Pilih minimal satu item yang sesuai dengan target voucher.', 'voucher_target_required');
        }
    }
    return [
        'code' => $code,
        'name' => clean_text($input['name'] ?? $code, 160) ?: $code,
        'description' => clean_text($input['description'] ?? '', 2000),
        'discount_type' => $discountType,
        'discount_value' => $discountValue,
        'max_discount' => clean_number($input['maxDiscount'] ?? $input['max_discount'] ?? 0, 0, 1000000000),
        'min_subtotal' => clean_number($input['minimumSubtotal'] ?? $input['minimum_subtotal'] ?? $input['minSubtotal'] ?? $input['min_subtotal'] ?? 0, 0, 1000000000),
        'starts_at' => $startsAt,
        'ends_at' => $endsAt,
        'status' => $status,
        'total_quota' => clean_number($input['totalQuota'] ?? $input['total_quota'] ?? 0, 0, 1000000000),
        'per_customer_quota' => clean_number($input['perUserQuota'] ?? $input['per_user_quota'] ?? $input['perCustomerQuota'] ?? $input['per_customer_quota'] ?? 0, 0, 1000000000),
        'target_type' => $targetType,
        'eligible_items' => json_encode($eligibleItems, JSON_UNESCAPED_UNICODE),
        'combine_with_sale' => voucher_bool($input['combineWithSale'] ?? $input['combine_with_sale'] ?? false) ? 1 : 0,
        'combine_with_bundle' => voucher_bool($input['combineWithBundle'] ?? $input['combine_with_bundle'] ?? false) ? 1 : 0,
    ];
}

function voucher_admin_list(PDO $pdo): array
{
    $rows = $pdo->query(
        "SELECT v.*,
            COALESCE(r.reserved_count, 0) reserved_count,
            COALESCE(r.used_count, 0) used_count,
            COALESCE(r.released_count, 0) released_count,
            COALESCE(r.expired_count, 0) expired_count,
            COALESCE(r.discount_given, 0) discount_given
         FROM vouchers v
         LEFT JOIN (
            SELECT voucher_id,
                SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) reserved_count,
                SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) used_count,
                SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) released_count,
                SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) expired_count,
                SUM(CASE WHEN status = 'used' THEN discount_amount ELSE 0 END) discount_given
            FROM voucher_redemptions GROUP BY voucher_id
         ) r ON r.voucher_id = v.id
         ORDER BY v.created_at DESC, v.id DESC"
    )->fetchAll();
    return array_map(static function (array $row): array {
        return voucher_public($row, true);
    }, $rows);
}

try {
    if ($method === 'GET') {
        $voucherId = clean_text($_GET['voucherId'] ?? '', 120);
        $redemptions = [];
        if ($voucherId !== '' || !array_key_exists('includeRedemptions', $_GET) || voucher_bool($_GET['includeRedemptions'] ?? false)) {
            $sql = "SELECT r.id, r.voucher_id, r.voucher_code, r.order_ref, r.member_id, r.buyer_email, r.order_type, r.subtotal, r.discount_amount, r.final_amount, r.status, r.expires_at, r.used_at, r.released_at, r.release_reason, r.created_at, r.updated_at, COALESCE(a.name, '') member_name FROM voucher_redemptions r LEFT JOIN accounts a ON a.role = 'member' AND (a.id = r.member_id OR (r.member_id = '' AND a.email = r.buyer_email))";
            $params = [];
            $where = ["r.status = 'used'"];
            if ($voucherId !== '') { $where[] = 'r.voucher_id = ?'; $params[] = $voucherId; }
            $sql .= ' WHERE ' . implode(' AND ', $where) . ' ORDER BY r.used_at DESC, r.created_at DESC LIMIT 200';
            $query = $pdo->prepare($sql); $query->execute($params);
            foreach ($query->fetchAll() as $row) {
                $redemptions[] = [
                    'id' => $row['id'], 'voucherId' => $row['voucher_id'], 'voucherCode' => $row['voucher_code'],
                    'orderRef' => $row['order_ref'], 'orderReference' => $row['order_ref'], 'memberId' => $row['member_id'],
                    'buyerEmail' => $row['buyer_email'], 'memberEmail' => $row['buyer_email'], 'memberName' => $row['member_name'] ?: 'Pembeli',
                    'orderType' => $row['order_type'], 'subtotal' => (int) $row['subtotal'],
                    'discountAmount' => (int) $row['discount_amount'], 'finalAmount' => (int) $row['final_amount'], 'finalTotal' => (int) $row['final_amount'],
                    'status' => $row['status'], 'expiresAt' => voucher_datetime_public($row['expires_at']),
                    'usedAt' => voucher_datetime_public($row['used_at']), 'redeemedAt' => voucher_datetime_public($row['used_at'] ?: $row['created_at']), 'releasedAt' => voucher_datetime_public($row['released_at']),
                    'releaseReason' => $row['release_reason'], 'createdAt' => voucher_datetime_public($row['created_at']),
                    'updatedAt' => voucher_datetime_public($row['updated_at']),
                ];
            }
        }
        $vouchers = voucher_admin_list($pdo);
        $statsQuery = $pdo->query("SELECT COUNT(*) redemption_count, COALESCE(SUM(discount_amount), 0) discount_total FROM voucher_redemptions WHERE status = 'used'")->fetch() ?: [];
        $activeCount = 0;
        $now = time();
        foreach ($vouchers as $voucher) {
            $startsAt = !empty($voucher['startsAt']) ? strtotime((string) $voucher['startsAt']) : false;
            $endsAt = !empty($voucher['endsAt']) ? strtotime((string) $voucher['endsAt']) : false;
            $remainingQuota = $voucher['stats']['remainingQuota'] ?? null;
            if (
                ($voucher['status'] ?? '') === 'active'
                && ($startsAt === false || $startsAt <= $now)
                && ($endsAt === false || $endsAt >= $now)
                && ($remainingQuota === null || (int) $remainingQuota > 0)
            ) {
                $activeCount++;
            }
        }
        send_json(200, [
            'vouchers' => $vouchers,
            'redemptions' => $redemptions,
            'stats' => [
                'total' => count(array_filter($vouchers, static function (array $voucher): bool { return ($voucher['status'] ?? '') !== 'archived'; })),
                'active' => $activeCount,
                'redemptions' => (int) ($statsQuery['redemption_count'] ?? 0),
                'discount' => (int) ($statsQuery['discount_total'] ?? 0),
            ],
        ]);
    }

    $body = read_json_body();
    if ($method === 'DELETE') {
        $id = clean_text($body['id'] ?? $_GET['id'] ?? '', 120);
        if ($id === '') throw new VoucherException('ID voucher wajib dikirim.', 'voucher_id_required', 400);
        $query = $pdo->prepare("UPDATE vouchers SET status = 'archived' WHERE id = ?");
        $query->execute([$id]);
        if ($query->rowCount() === 0) throw new VoucherException('Voucher tidak ditemukan.', 'voucher_not_found', 404);
        send_json(200, ['ok' => true, 'vouchers' => voucher_admin_list($pdo), 'message' => 'Voucher diarsipkan.']);
    }

    $data = voucher_admin_payload($body);
    if ($method === 'POST') {
        $id = clean_text($body['id'] ?? ($body['voucher']['id'] ?? ''), 120) ?: make_id('voucher');
        $insert = $pdo->prepare(
            'INSERT INTO vouchers
             (id, code, name, description, discount_type, discount_value, max_discount, min_subtotal, starts_at, ends_at, status, total_quota, per_customer_quota, target_type, eligible_items, combine_with_sale, combine_with_bundle, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([$id, $data['code'], $data['name'], $data['description'], $data['discount_type'], $data['discount_value'], $data['max_discount'], $data['min_subtotal'], $data['starts_at'], $data['ends_at'], $data['status'], $data['total_quota'], $data['per_customer_quota'], $data['target_type'], $data['eligible_items'], $data['combine_with_sale'], $data['combine_with_bundle'], clean_text($admin['userId'] ?? '', 120)]);
        send_json(201, ['ok' => true, 'id' => $id, 'vouchers' => voucher_admin_list($pdo), 'message' => 'Voucher berhasil dibuat.']);
    }

    $id = clean_text($body['id'] ?? ($body['voucher']['id'] ?? ''), 120);
    if ($id === '') throw new VoucherException('ID voucher wajib dikirim.', 'voucher_id_required', 400);
    $currentQuery = $pdo->prepare('SELECT code FROM vouchers WHERE id = ? LIMIT 1');
    $currentQuery->execute([$id]);
    $currentVoucher = $currentQuery->fetch();
    if (!$currentVoucher) throw new VoucherException('Voucher tidak ditemukan.', 'voucher_not_found', 404);
    if (voucher_clean_code($currentVoucher['code'] ?? '') !== $data['code']) {
        throw new VoucherException('Kode voucher tidak dapat diubah setelah voucher dibuat.', 'voucher_code_locked', 409);
    }
    $update = $pdo->prepare(
        'UPDATE vouchers SET code = ?, name = ?, description = ?, discount_type = ?, discount_value = ?, max_discount = ?, min_subtotal = ?, starts_at = ?, ends_at = ?, status = ?, total_quota = ?, per_customer_quota = ?, target_type = ?, eligible_items = ?, combine_with_sale = ?, combine_with_bundle = ? WHERE id = ?'
    );
    $update->execute([$data['code'], $data['name'], $data['description'], $data['discount_type'], $data['discount_value'], $data['max_discount'], $data['min_subtotal'], $data['starts_at'], $data['ends_at'], $data['status'], $data['total_quota'], $data['per_customer_quota'], $data['target_type'], $data['eligible_items'], $data['combine_with_sale'], $data['combine_with_bundle'], $id]);
    send_json(200, ['ok' => true, 'id' => $id, 'vouchers' => voucher_admin_list($pdo), 'message' => 'Voucher berhasil diperbarui.']);
} catch (VoucherException $error) {
    send_json($error->apiStatus(), ['message' => $error->getMessage(), 'code' => $error->errorCode()]);
} catch (PDOException $error) {
    $duplicate = (string) $error->getCode() === '23000';
    send_json($duplicate ? 409 : 500, [
        'message' => $duplicate ? 'Kode voucher sudah digunakan.' : 'Voucher tidak dapat disimpan.',
        'code' => $duplicate ? 'voucher_code_duplicate' : 'voucher_save_failed',
    ]);
}
