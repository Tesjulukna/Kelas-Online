<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);

$pdo = db();

function activity_rows(PDO $pdo, string $sql): array
{
    try {
        return $pdo->query($sql)->fetchAll();
    } catch (Throwable $error) {
        return [];
    }
}

function activity_text($value, int $max = 180): string
{
    return clean_text($value ?? '', $max);
}

function activity_map_by_id(array $rows): array
{
    $map = [];

    foreach ($rows as $row) {
        if (!empty($row['id'])) {
            $map[$row['id']] = $row;
        }
    }

    return $map;
}

$members = activity_rows(
    $pdo,
    "SELECT id, name, email, avatar, allowed_class_ids, joined_at, created_at, updated_at
    FROM accounts
    WHERE role = 'member' AND status = 'Aktif'
    LIMIT 1000",
);
$classes = activity_rows(
    $pdo,
    'SELECT id, title, lynk_product_key, tripay_product_key FROM classes ORDER BY updated_at DESC, id ASC',
);
$products = activity_rows(
    $pdo,
    'SELECT id, title, lynk_product_key, tripay_product_key FROM digital_products ORDER BY updated_at DESC, id ASC',
);
$memberById = activity_map_by_id($members);
$memberByEmail = [];
$classById = activity_map_by_id($classes);
$productById = activity_map_by_id($products);
$titleByKey = [];

foreach ($members as $member) {
    $email = strtolower((string) ($member['email'] ?? ''));

    if ($email !== '') {
        $memberByEmail[$email] = $member;
    }
}

foreach (array_merge($classes, $products) as $item) {
    foreach (['id', 'title', 'lynk_product_key', 'tripay_product_key'] as $field) {
        $key = strtolower(trim((string) ($item[$field] ?? '')));

        if ($key !== '') {
            $titleByKey[$key] = $item['title'];
        }
    }
}

$activities = [];
$push = static function (array $item) use (&$activities): void {
    if (empty($item['itemTitle'])) {
        return;
    }

    $activities[] = [
        'id' => activity_text($item['id'] ?? make_id('activity'), 240),
        'name' => activity_text($item['name'] ?? 'Pelanggan', 160),
        'avatar' => clean_asset_url($item['avatar'] ?? ''),
        'actionText' => activity_text($item['actionText'] ?? 'mengakses', 80),
        'itemTitle' => activity_text($item['itemTitle'] ?? '', 180),
        'itemId' => activity_text($item['itemId'] ?? '', 160),
        'type' => activity_text($item['type'] ?? 'kelas', 40),
        'createdAt' => activity_text($item['createdAt'] ?? '', 80),
    ];
};

foreach ($members as $member) {
    $allowed = json_decode((string) ($member['allowed_class_ids'] ?? '[]'), true);

    if (!is_array($allowed)) {
        continue;
    }

    foreach ($allowed as $classId) {
        $classId = activity_text($classId, 120);
        $class = $classById[$classId] ?? null;

        if (!$class) {
            continue;
        }

        $push([
            'id' => 'member-class:' . $member['id'] . ':' . $classId,
            'name' => $member['name'] ?? '',
            'avatar' => $member['avatar'] ?? '',
            'actionText' => 'mengakses kelas',
            'itemTitle' => $class['title'] ?? '',
            'itemId' => $classId,
            'type' => 'kelas',
            'createdAt' => $member['joined_at'] ?? $member['created_at'] ?? '',
        ]);
    }
}

$paymentRows = activity_rows(
    $pdo,
    "SELECT * FROM payment_snapshots
    WHERE access_granted = 1 OR LOWER(status) IN ('paid','processed','success','settlement','capture')
    ORDER BY updated_at DESC
    LIMIT 1000",
);

foreach ($paymentRows as $payment) {
    $isProduct = ($payment['item_type'] ?? '') === 'digital_product' || !empty($payment['product_id']);
    $member = $memberById[$payment['member_id'] ?? ''] ?? $memberByEmail[strtolower((string) ($payment['buyer_email'] ?? ''))] ?? null;
    $itemId = $isProduct ? ($payment['product_id'] ?? '') : ($payment['class_id'] ?? '');
    $itemTitle = $isProduct
        ? ($productById[$itemId]['title'] ?? $payment['product_title'] ?? '')
        : ($classById[$itemId]['title'] ?? $payment['class_title'] ?? '');

    $push([
        'id' => 'snapshot:' . ($payment['id'] ?? ''),
        'name' => $member['name'] ?? $payment['buyer_name'] ?? '',
        'avatar' => $member['avatar'] ?? '',
        'actionText' => $isProduct ? 'membeli produk digital' : 'mendaftar kelas',
        'itemTitle' => $itemTitle,
        'itemId' => $itemId,
        'type' => $isProduct ? 'produk' : 'kelas',
        'createdAt' => $payment['created_at'] ?? '',
    ]);
}

$tripayRows = activity_rows(
    $pdo,
    "SELECT * FROM tripay_orders
    WHERE access_granted = 1 OR LOWER(status) IN ('paid','processed','success','settlement','capture')
    ORDER BY updated_at DESC
    LIMIT 1000",
);

foreach ($tripayRows as $order) {
    $member = $memberById[$order['member_id'] ?? ''] ?? $memberByEmail[strtolower((string) ($order['buyer_email'] ?? ''))] ?? null;
    $classId = $order['class_id'] ?? '';
    $push([
        'id' => 'tripay:' . ($order['id'] ?? ''),
        'name' => $member['name'] ?? $order['buyer_name'] ?? '',
        'avatar' => $member['avatar'] ?? '',
        'actionText' => 'mendaftar kelas',
        'itemTitle' => $classById[$classId]['title'] ?? $order['class_title'] ?? '',
        'itemId' => $classId,
        'type' => 'kelas',
        'createdAt' => $order['updated_at'] ?? $order['created_at'] ?? '',
    ]);
}

$accessRows = activity_rows(
    $pdo,
    "SELECT * FROM digital_product_access WHERE status = 'active' ORDER BY created_at DESC LIMIT 1000",
);

foreach ($accessRows as $access) {
    $member = $memberById[$access['member_id'] ?? ''] ?? $memberByEmail[strtolower((string) ($access['buyer_email'] ?? ''))] ?? null;
    $productId = $access['product_id'] ?? '';
    $push([
        'id' => 'access:' . ($access['id'] ?? ''),
        'name' => $member['name'] ?? $access['buyer_name'] ?? '',
        'avatar' => $member['avatar'] ?? '',
        'actionText' => 'mengakses produk digital',
        'itemTitle' => $productById[$productId]['title'] ?? $access['product_title'] ?? '',
        'itemId' => $productId,
        'type' => 'produk',
        'createdAt' => $access['created_at'] ?? '',
    ]);
}

$unique = [];

foreach ($activities as $activity) {
    $key = $activity['id'] ?: $activity['type'] . ':' . $activity['name'] . ':' . $activity['itemTitle'];

    if (!isset($unique[$key]) && $activity['name'] !== '' && $activity['itemTitle'] !== '') {
        $unique[$key] = $activity;
    }
}

$activities = array_values($unique);
usort($activities, static function (array $first, array $second): int {
    return (strtotime($second['createdAt'] ?? '') ?: 0) <=> (strtotime($first['createdAt'] ?? '') ?: 0);
});
$activities = array_slice($activities, 0, 300);
shuffle($activities);

send_json(200, [
    'activities' => $activities,
    'updatedAt' => date(DATE_ATOM),
]);

