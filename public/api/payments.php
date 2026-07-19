<?php

require __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_tripay.php';

ensure_method(['GET']);

$user = require_user();
$pdo = db();
$config = api_config();

function payment_order_payload(array $row): array
{
    $payload = json_decode((string) ($row['payload'] ?? '{}'), true);

    return is_array($payload) ? $payload : [];
}

function payment_payload_value(array $payload, array $paths)
{
    foreach ($paths as $path) {
        $current = $payload;

        foreach (explode('.', $path) as $segment) {
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                $current = null;
                break;
            }

            $current = $current[$segment];
        }

        if (is_scalar($current) && trim((string) $current) !== '') {
            return $current;
        }
    }

    return null;
}

function payment_amount_value($value): int
{
    if ($value === null || $value === '') {
        return 0;
    }

    if (is_numeric($value)) {
        return max(0, (int) round((float) $value));
    }

    $normalized = preg_replace('/[^0-9]/', '', (string) $value) ?? '';

    return $normalized === '' ? 0 : (int) $normalized;
}

function payment_amount_from_payload(array $payload): int
{
    $value = payment_payload_value($payload, [
        'amount',
        'total',
        'total_amount',
        'total_price',
        'grand_total',
        'grandTotal',
        'paid_amount',
        'amount_paid',
        'payment_amount',
        'gross_amount',
        'price',
        'nominal',
        'subtotal',
        'order.amount',
        'order.total',
        'order.total_amount',
        'order.total_price',
        'order.grand_total',
        'order.grandTotal',
        'order.paid_amount',
        'order.amount_paid',
        'invoice.amount',
        'invoice.total',
        'invoice.total_amount',
        'invoice.total_price',
        'invoice.grand_total',
        'invoice.grandTotal',
        'payment.amount',
        'payment.total',
        'payment.total_amount',
        'payment.total_price',
        'payment.grand_total',
        'payment.grandTotal',
        'transaction.amount',
        'transaction.total',
        'transaction.total_amount',
        'transaction.total_price',
        'transaction.gross_amount',
        'data.amount',
        'data.total',
        'data.total_amount',
        'data.total_price',
        'data.grand_total',
        'data.grandTotal',
        'data.paid_amount',
        'data.amount_paid',
        'data.payment_amount',
        'data.gross_amount',
        'data.price',
        'data.nominal',
        'data.order.amount',
        'data.order.total',
        'data.order.total_amount',
        'data.order.total_price',
        'data.order.grand_total',
        'data.order.grandTotal',
        'data.order.paid_amount',
        'data.invoice.amount',
        'data.invoice.total',
        'data.invoice.total_amount',
        'data.invoice.total_price',
        'data.invoice.grand_total',
        'data.invoice.grandTotal',
        'data.payment.amount',
        'data.payment.total',
        'data.payment.total_amount',
        'data.payment.total_price',
        'data.payment.grand_total',
        'data.payment.grandTotal',
        'data.transaction.amount',
        'data.transaction.total',
        'data.transaction.total_amount',
        'data.transaction.total_price',
        'data.transaction.gross_amount',
    ]);
    $amount = payment_amount_value($value);

    if ($amount > 0) {
        return $amount;
    }

    $sum = 0;

    foreach ([
        'items',
        'products',
        'line_items',
        'lineItems',
        'order_items',
        'orderItems',
        'order.items',
        'order.products',
        'order.line_items',
        'order.lineItems',
        'cart.items',
        'invoice.items',
        'payment.items',
        'transaction.items',
        'message_data.items',
        'messageData.items',
        'data.items',
        'data.products',
        'data.line_items',
        'data.lineItems',
        'data.order_items',
        'data.orderItems',
        'data.order.items',
        'data.order.products',
        'data.order.line_items',
        'data.order.lineItems',
        'data.cart.items',
        'data.invoice.items',
        'data.payment.items',
        'data.transaction.items',
        'data.message_data.items',
        'data.messageData.items',
    ] as $listPath) {
        $items = payment_nested_array($payload, $listPath);

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $itemAmount = payment_amount_value(payment_payload_value($item, [
                'total',
                'total_amount',
                'total_price',
                'grand_total',
                'grandTotal',
                'amount',
                'paid_amount',
                'price',
                'subtotal',
                'product.price',
                'product.amount',
                'product.total',
            ]));

            if ($itemAmount <= 0) {
                continue;
            }

            $qty = payment_amount_value(payment_payload_value($item, ['quantity', 'qty']));
            $sum += $itemAmount * max(1, $qty);
        }
    }

    return $sum;
}

function payment_nested_array(array $payload, string $path): array
{
    $current = $payload;

    foreach (explode('.', $path) as $segment) {
        if (!is_array($current) || !array_key_exists($segment, $current)) {
            return [];
        }

        $current = $current[$segment];
    }

    return is_array($current) ? $current : [];
}

function payment_buyer_name_from_payload(array $payload): string
{
    $value = payment_payload_value($payload, [
        'buyer.name',
        'buyer.full_name',
        'buyer.fullName',
        'buyer.fullname',
        'buyer_name',
        'buyer_full_name',
        'buyerFullName',
        'buyerFullname',
        'customer.name',
        'customer.full_name',
        'customer.fullName',
        'customer.fullname',
        'customer_name',
        'customer_full_name',
        'customerFullName',
        'customerFullname',
        'user.name',
        'user.full_name',
        'user.fullName',
        'user.fullname',
        'contact.name',
        'contact.full_name',
        'contact.fullName',
        'order.customer_name',
        'order.customer.name',
        'order.customer.full_name',
        'order.customer.fullName',
        'order.buyer_name',
        'order.buyer.name',
        'order.buyer.full_name',
        'order.buyer.fullName',
        'order.name',
        'transaction.customer_name',
        'transaction.buyer_name',
        'payment.customer_name',
        'payment.buyer_name',
        'checkout.customer_name',
        'checkout.name',
        'metadata.customer_name',
        'metadata.buyer_name',
        'metadata.full_name',
        'metadata.fullName',
        'message_data.customer.name',
        'message_data.customer.full_name',
        'message_data.buyer.name',
        'message_data.name',
        'messageData.customer.name',
        'messageData.customer.fullName',
        'messageData.name',
        'data.buyer.name',
        'data.buyer.full_name',
        'data.buyer.fullName',
        'data.customer.name',
        'data.customer.full_name',
        'data.customer.fullName',
        'data.customer.fullname',
        'data.customer_name',
        'data.buyer_name',
        'data.user.name',
        'data.user.full_name',
        'data.user.fullName',
        'data.contact.name',
        'data.order.customer_name',
        'data.order.customer.name',
        'data.order.customer.full_name',
        'data.order.customer.fullName',
        'data.order.buyer_name',
        'data.order.buyer.name',
        'data.order.buyer.full_name',
        'data.order.buyer.fullName',
        'data.transaction.customer_name',
        'data.payment.customer_name',
        'data.metadata.customer_name',
        'data.metadata.buyer_name',
        'data.metadata.full_name',
        'data.metadata.fullName',
        'data.message_data.customer.name',
        'data.message_data.customer.full_name',
        'data.message_data.name',
        'data.messageData.customer.name',
        'data.messageData.name',
    ]);

    if ($value !== null) {
        $name = clean_text($value, 160);

        if ($name !== '' && !filter_var($name, FILTER_VALIDATE_EMAIL) && !preg_match('/https?:\/\//i', $name)) {
            return $name;
        }
    }

    foreach ([
        'custom_fields',
        'customFields',
        'fields',
        'answers',
        'form',
        'form_data',
        'formData',
        'message_data.custom_fields',
        'message_data.fields',
        'message_data.answers',
        'messageData.customFields',
        'messageData.fields',
        'messageData.answers',
        'data.custom_fields',
        'data.customFields',
        'data.fields',
        'data.answers',
        'data.form',
        'data.form_data',
        'data.formData',
        'data.message_data.custom_fields',
        'data.message_data.fields',
        'data.message_data.answers',
    ] as $path) {
        $group = payment_nested_array($payload, $path);

        if (!$group) {
            continue;
        }

        foreach (['nama', 'name', 'full_name', 'fullName', 'customer_name', 'buyer_name'] as $key) {
            if (!empty($group[$key]) && is_scalar($group[$key])) {
                return clean_text($group[$key], 160);
            }
        }

        foreach ($group as $item) {
            if (!is_array($item)) {
                continue;
            }

            $label = strtolower(implode(' ', array_filter([
                clean_text($item['label'] ?? '', 80),
                clean_text($item['name'] ?? '', 80),
                clean_text($item['key'] ?? '', 80),
                clean_text($item['question'] ?? '', 80),
                clean_text($item['title'] ?? '', 80),
            ])));

            if ($label === '' || !preg_match('/\bnama\b|\bname\b|full.?name|customer.?name|buyer.?name/', $label)) {
                continue;
            }

            if (preg_match('/product|produk|item|kelas|class|course/', $label)) {
                continue;
            }

            foreach (['value', 'answer', 'text', 'content'] as $valueKey) {
                if (!empty($item[$valueKey]) && is_scalar($item[$valueKey])) {
                    return clean_text($item[$valueKey], 160);
                }
            }
        }
    }

    return '';
}

function payment_product_name_from_payload(array $payload): string
{
    $value = payment_payload_value($payload, [
        'product.name',
        'product.title',
        'product.product_name',
        'product.productName',
        'product.label',
        'item.name',
        'item.title',
        'item.product_name',
        'item.productName',
        'item.label',
        'order.product_name',
        'order.productName',
        'order.item_name',
        'order.itemName',
        'order.title',
        'order.items.0.name',
        'order.items.0.title',
        'order.products.0.name',
        'order.products.0.title',
        'invoice.items.0.name',
        'invoice.items.0.title',
        'payment.items.0.name',
        'payment.items.0.title',
        'transaction.items.0.name',
        'transaction.items.0.title',
        'data.product.name',
        'data.product.title',
        'data.product.product_name',
        'data.product.productName',
        'data.product.label',
        'data.item.name',
        'data.item.title',
        'data.item.product_name',
        'data.item.productName',
        'data.item.label',
        'data.product_name',
        'data.productName',
        'data.item_name',
        'data.itemName',
        'data.title',
        'data.order.product_name',
        'data.order.productName',
        'data.order.item_name',
        'data.order.itemName',
        'data.order.title',
        'data.order.items.0.name',
        'data.order.items.0.title',
        'data.order.products.0.name',
        'data.order.products.0.title',
        'data.invoice.items.0.name',
        'data.invoice.items.0.title',
        'data.payment.items.0.name',
        'data.payment.items.0.title',
        'data.transaction.items.0.name',
        'data.transaction.items.0.title',
        'product_name',
        'productName',
        'item_name',
        'itemName',
        'title',
    ]);

    if ($value !== null) {
        $name = clean_text($value, 180);

        if ($name !== '' && !filter_var($name, FILTER_VALIDATE_EMAIL) && !preg_match('/https?:\/\//i', $name)) {
            return $name;
        }
    }

    foreach ([
        'items',
        'products',
        'line_items',
        'lineItems',
        'order_items',
        'orderItems',
        'order.items',
        'order.products',
        'order.line_items',
        'order.lineItems',
        'cart.items',
        'invoice.items',
        'payment.items',
        'transaction.items',
        'message_data.items',
        'messageData.items',
        'data.items',
        'data.products',
        'data.line_items',
        'data.lineItems',
        'data.order_items',
        'data.orderItems',
        'data.order.items',
        'data.order.products',
        'data.order.line_items',
        'data.order.lineItems',
        'data.cart.items',
        'data.invoice.items',
        'data.payment.items',
        'data.transaction.items',
        'data.message_data.items',
        'data.messageData.items',
    ] as $listPath) {
        foreach (payment_nested_array($payload, $listPath) as $item) {
            if (!is_array($item)) {
                continue;
            }

            $name = payment_payload_value($item, [
                'product.name',
                'product.title',
                'product.product_name',
                'product.productName',
                'name',
                'title',
                'label',
                'product_name',
                'productName',
                'item_name',
                'itemName',
            ]);

            if ($name !== null) {
                $name = clean_text($name, 180);

                if ($name !== '' && !filter_var($name, FILTER_VALIDATE_EMAIL) && !preg_match('/https?:\/\//i', $name)) {
                    return $name;
                }
            }
        }
    }

    foreach ([
        'custom_fields',
        'customFields',
        'fields',
        'answers',
        'form',
        'form_data',
        'formData',
        'message_data.custom_fields',
        'message_data.fields',
        'message_data.answers',
        'messageData.customFields',
        'messageData.fields',
        'messageData.answers',
        'data.custom_fields',
        'data.customFields',
        'data.fields',
        'data.answers',
        'data.form',
        'data.form_data',
        'data.formData',
        'data.message_data.custom_fields',
        'data.message_data.fields',
        'data.message_data.answers',
    ] as $path) {
        $group = payment_nested_array($payload, $path);

        if (!$group) {
            continue;
        }

        foreach (['product_name', 'productName', 'item_name', 'itemName', 'kelas', 'class', 'course'] as $key) {
            if (!empty($group[$key]) && is_scalar($group[$key])) {
                return clean_text($group[$key], 180);
            }
        }

        foreach ($group as $item) {
            if (!is_array($item)) {
                continue;
            }

            $label = strtolower(implode(' ', array_filter([
                clean_text($item['label'] ?? '', 80),
                clean_text($item['name'] ?? '', 80),
                clean_text($item['key'] ?? '', 80),
                clean_text($item['question'] ?? '', 80),
                clean_text($item['title'] ?? '', 80),
            ])));

            if ($label === '' || !preg_match('/product|produk|item|kelas|class|course/', $label)) {
                continue;
            }

            foreach (['value', 'answer', 'text', 'content'] as $valueKey) {
                if (!empty($item[$valueKey]) && is_scalar($item[$valueKey])) {
                    return clean_text($item[$valueKey], 180);
                }
            }
        }
    }

    return '';
}

function payment_time_value($value): int
{
    if (is_numeric($value)) {
        $number = (int) $value;

        if ($number > 1000000000000) {
            return (int) floor($number / 1000);
        }

        return $number > 1000000000 ? $number : 0;
    }

    $time = strtotime((string) $value);

    return $time ?: 0;
}

function payment_tripay_expires_at(array $row, array $payload, int $defaultMinutes): int
{
    $value = payment_payload_value($payload, [
        'expired_time',
        'expires_at',
        'expired_at',
        'data.expired_time',
        'data.expires_at',
        'data.expired_at',
        'response.expired_time',
        'response.expires_at',
        'response.expired_at',
        'response.data.expired_time',
        'response.data.expires_at',
        'response.data.expired_at',
    ]);
    $expiresAt = payment_time_value($value);

    if ($expiresAt > 0) {
        return $expiresAt;
    }

    $createdAt = payment_time_value($row['created_at'] ?? '');

    return $createdAt > 0 ? $createdAt + ($defaultMinutes * 60) : 0;
}

function payment_is_pending_status(string $status): bool
{
    return in_array(strtolower($status), ['pending', 'unpaid', 'waiting', 'callback'], true);
}

function payment_remote_expired_status(string $status): bool
{
    return in_array(strtolower($status), [
        'expired',
        'expire',
        'failed',
        'failure',
        'cancel',
        'canceled',
        'cancelled',
        'closed',
    ], true);
}

function payment_sync_pending_tripay_order(PDO $pdo, array $config, array $row, array $payload): array
{
    $status = strtolower(clean_text($row['status'] ?? 'pending', 40));

    if (!payment_is_pending_status($status) || !empty($row['access_granted'])) {
        return [$row, $payload];
    }

    $reference = clean_text($row['reference'] ?? '', 180);

    if ($reference === '' || !function_exists('tripay_fetch_transaction_detail')) {
        return [$row, $payload];
    }

    $detailResult = tripay_fetch_transaction_detail($config, $reference);

    if (empty($detailResult['ok']) || !is_array($detailResult['data'] ?? null)) {
        return [$row, $payload];
    }

    $detail = $detailResult['data'];
    $remoteStatus = strtolower(clean_text(payment_payload_value($detail, [
        'status',
        'data.status',
        'payment_status',
        'data.payment_status',
    ]) ?? '', 40));
    $remoteExpiresAt = payment_time_value(payment_payload_value($detail, [
        'expired_time',
        'expires_at',
        'expired_at',
        'data.expired_time',
        'data.expires_at',
        'data.expired_at',
    ]));

    if ($remoteStatus !== '') {
        $payload['tripay_status'] = $remoteStatus;
    }

    if ($remoteExpiresAt > 0) {
        $payload['expired_time'] = $remoteExpiresAt;
    }

    $payload['tripay_detail'] = $detail;
    $shouldMarkExpired =
        payment_remote_expired_status($remoteStatus) ||
        ($remoteExpiresAt > 0 && $remoteExpiresAt <= time());

    if (!$shouldMarkExpired) {
        return [$row, $payload];
    }

    $encodedPayload = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $row['status'] = 'expired';
    $row['payload'] = $encodedPayload;

    try {
        $update = $pdo->prepare(
            "UPDATE tripay_orders
            SET status = ?, payload = ?
            WHERE id = ? AND status IN ('pending', 'unpaid', 'waiting', 'callback')",
        );
        $update->execute(['expired', $encodedPayload, $row['id']]);
    } catch (Throwable $error) {
        // The response can still mark the order expired even if DB update is blocked.
    }

    return [$row, $payload];
}

function payment_class_amount(array $class): int
{
    $salePrice = (int) ($class['sale_price'] ?? 0);
    $price = (int) ($class['price'] ?? 0);

    return $salePrice > 0 ? $salePrice : max(0, $price);
}

function payment_product_amount(array $product): int
{
    $salePrice = (int) ($product['sale_price'] ?? 0);
    $price = (int) ($product['price'] ?? 0);

    return $salePrice > 0 ? $salePrice : max(0, $price);
}

function payment_fetch_class_map(PDO $pdo): array
{
    $classes = [];

    try {
        $rows = $pdo->query('SELECT id, title, price, sale_price FROM classes')->fetchAll();
    } catch (Throwable $error) {
        try {
            $rows = $pdo->query('SELECT id, title, price FROM classes')->fetchAll();
        } catch (Throwable $innerError) {
            return [];
        }
    }

    foreach ($rows as $row) {
        if (!array_key_exists('sale_price', $row)) {
            $row['sale_price'] = 0;
        }

        $classes[(string) ($row['id'] ?? '')] = $row;
    }

    return $classes;
}

function payment_normalize_key($value): string
{
    $key = strtolower(clean_text($value, 240));
    $key = preg_replace('/[^a-z0-9]+/', '-', $key) ?? '';

    return trim($key, '-');
}

function payment_fetch_product_map(PDO $pdo): array
{
    $products = [];

    try {
        $rows = $pdo->query('SELECT id, title, price, sale_price, lynk_product_key FROM digital_products')->fetchAll();
    } catch (Throwable $error) {
        try {
            $rows = $pdo->query('SELECT id, title, price, sale_price FROM digital_products')->fetchAll();
        } catch (Throwable $innerError) {
            try {
                $rows = $pdo->query('SELECT id, title, price FROM digital_products')->fetchAll();
            } catch (Throwable $fallbackError) {
                return [];
            }
        }
    }

    foreach ($rows as $row) {
        if (!array_key_exists('sale_price', $row)) {
            $row['sale_price'] = 0;
        }

        if (!array_key_exists('lynk_product_key', $row)) {
            $row['lynk_product_key'] = '';
        }

        $products[(string) ($row['id'] ?? '')] = $row;
    }

    return $products;
}

function payment_find_products_by_candidates(array $productMap, array $candidates): array
{
    $candidateKeys = array_values(array_unique(array_filter(array_map('payment_normalize_key', $candidates))));
    $matches = [];

    if (!$candidateKeys) {
        return [];
    }

    foreach ($productMap as $product) {
        $keys = [
            payment_normalize_key($product['id'] ?? ''),
            payment_normalize_key($product['title'] ?? ''),
            payment_normalize_key($product['lynk_product_key'] ?? ''),
        ];

        foreach ($candidateKeys as $candidateKey) {
            if ($candidateKey === '') {
                continue;
            }

            if (in_array($candidateKey, $keys, true)) {
                $matches[] = $product;
                continue 2;
            }

            foreach ($keys as $productKey) {
                if ($productKey !== '' && (strpos($candidateKey, $productKey) !== false || strpos($productKey, $candidateKey) !== false)) {
                    $matches[] = $product;
                    continue 3;
                }
            }
        }
    }

    return $matches;
}

function payment_snapshot_created_at(array $row): string
{
    foreach (['created_at', 'joined_at', 'updated_at'] as $key) {
        $value = trim((string) ($row[$key] ?? ''));

        if ($value === '' || strpos($value, '0000-00-00') === 0) {
            continue;
        }

        $time = strtotime($value);

        if ($time) {
            return date('Y-m-d H:i:s', $time);
        }
    }

    return date('Y-m-d H:i:s');
}

function payment_pair_key(string $memberId, string $classId): string
{
    return $memberId . '::' . $classId;
}

function payment_product_pair_key(string $memberId, string $email, string $productId): string
{
    $buyerKey = $memberId !== '' ? $memberId : strtolower($email);

    return $buyerKey . '::' . $productId;
}

function payment_collect_existing_pairs(PDO $pdo): array
{
    $pairs = [];

    try {
        foreach ($pdo->query("SELECT member_id, class_id FROM payment_snapshots WHERE member_id <> '' AND class_id <> ''")->fetchAll() as $row) {
            $pairs[payment_pair_key((string) $row['member_id'], (string) $row['class_id'])] = true;
        }
    } catch (Throwable $error) {
        // Table may not exist on older installs.
    }

    try {
        foreach ($pdo->query("SELECT member_id, class_id FROM tripay_orders WHERE member_id <> '' AND class_id <> '' AND class_id NOT LIKE 'product:%' AND (access_granted = 1 OR status IN ('paid', 'processed', 'success', 'settlement'))")->fetchAll() as $row) {
            $pairs[payment_pair_key((string) $row['member_id'], (string) $row['class_id'])] = true;
        }
    } catch (Throwable $error) {
        // Continue.
    }

    try {
        foreach ($pdo->query("SELECT member_id, class_ids FROM lynk_orders WHERE member_id <> '' AND status = 'processed'")->fetchAll() as $row) {
            $classIds = json_decode((string) ($row['class_ids'] ?? '[]'), true);

            if (!is_array($classIds)) {
                continue;
            }

            foreach ($classIds as $classId) {
                $classId = clean_text($classId, 120);

                if ($classId !== '') {
                    $pairs[payment_pair_key((string) $row['member_id'], $classId)] = true;
                }
            }
        }
    } catch (Throwable $error) {
        // Continue.
    }

    return $pairs;
}

function payment_collect_existing_product_pairs(PDO $pdo): array
{
    $pairs = [];

    try {
        foreach ($pdo->query("SELECT member_id, buyer_email, product_id FROM payment_snapshots WHERE product_id <> ''")->fetchAll() as $row) {
            $productId = clean_text($row['product_id'] ?? '', 120);

            if ($productId !== '') {
                $pairs[payment_product_pair_key(
                    clean_text($row['member_id'] ?? '', 120),
                    clean_email($row['buyer_email'] ?? ''),
                    $productId,
                )] = true;
            }
        }
    } catch (Throwable $error) {
        // Table may not exist on older installs.
    }

    try {
        foreach ($pdo->query("SELECT member_id, buyer_email, class_id, status, access_granted FROM tripay_orders WHERE class_id LIKE 'product:%'")->fetchAll() as $row) {
            $status = strtolower(clean_text($row['status'] ?? '', 40));

            if (empty($row['access_granted']) && !in_array($status, ['paid', 'processed', 'success', 'settlement'], true)) {
                continue;
            }

            $productId = clean_text(substr((string) ($row['class_id'] ?? ''), 8), 120);

            if ($productId !== '') {
                $pairs[payment_product_pair_key(
                    clean_text($row['member_id'] ?? '', 120),
                    clean_email($row['buyer_email'] ?? ''),
                    $productId,
                )] = true;
            }
        }
    } catch (Throwable $error) {
        // Continue.
    }

    return $pairs;
}

function payment_backfill_member_access_snapshots(PDO $pdo): void
{
    try {
        $classes = [];
        $classRows = [];

        try {
            $classRows = $pdo->query('SELECT id, title, price, sale_price FROM classes')->fetchAll();
        } catch (Throwable $error) {
            $classRows = $pdo->query('SELECT id, title, price FROM classes')->fetchAll();
        }

        foreach ($classRows as $class) {
            if (!array_key_exists('sale_price', $class)) {
                $class['sale_price'] = 0;
            }

            $classes[(string) $class['id']] = $class;
        }

        if (!$classes) {
            return;
        }

        $existingPairs = payment_collect_existing_pairs($pdo);
        $members = $pdo
            ->query("SELECT id, name, email, allowed_class_ids, joined_at, created_at, updated_at FROM accounts WHERE role = 'member'")
            ->fetchAll();
        $insert = $pdo->prepare(
            'INSERT IGNORE INTO payment_snapshots
            (id, source, source_label, order_code, buyer_name, buyer_email, member_id, class_id, class_title, item_type, amount, status, payment_method, access_granted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );

        foreach ($members as $member) {
            $memberId = clean_text($member['id'] ?? '', 120);
            $classIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);

            if ($memberId === '' || !is_array($classIds) || !$classIds) {
                continue;
            }

            foreach ($classIds as $classId) {
                $classId = clean_text($classId, 120);

                if ($classId === '' || empty($classes[$classId])) {
                    continue;
                }

                $pairKey = payment_pair_key($memberId, $classId);

                if (!empty($existingPairs[$pairKey])) {
                    continue;
                }

                $class = $classes[$classId];
                $snapshotId = 'legacy-lynk-' . substr(hash('sha256', $pairKey), 0, 40);
                $orderCode = 'LYNK-LEGACY-' . strtoupper(substr(hash('sha256', $pairKey), 0, 10));

                $insert->execute([
                    $snapshotId,
                    'legacy_lynk_access',
                    'Akses lama / Lynk.id',
                    $orderCode,
                    clean_text($member['name'] ?? 'Member', 160),
                    clean_email($member['email'] ?? ''),
                    $memberId,
                    $classId,
                    clean_text($class['title'] ?? 'Kelas', 180),
                    'class',
                    0,
                    'paid',
                    'Lynk.id',
                    1,
                    payment_snapshot_created_at($member),
                ]);
                $existingPairs[$pairKey] = true;
            }
        }
    } catch (Throwable $error) {
        // Payment list should still load even if legacy backfill is blocked.
    }
}

function payment_backfill_product_access_snapshots(PDO $pdo): void
{
    try {
        $products = [];
        $productRows = [];

        try {
            $productRows = $pdo->query('SELECT id, title, price, sale_price FROM digital_products')->fetchAll();
        } catch (Throwable $error) {
            $productRows = $pdo->query('SELECT id, title, price FROM digital_products')->fetchAll();
        }

        foreach ($productRows as $product) {
            if (!array_key_exists('sale_price', $product)) {
                $product['sale_price'] = 0;
            }

            $products[(string) $product['id']] = $product;
        }

        if (!$products) {
            return;
        }

        $existingPairs = payment_collect_existing_product_pairs($pdo);
        $accessRows = $pdo
            ->query("SELECT * FROM digital_product_access
                WHERE status = 'active'
                  AND COALESCE(source, '') NOT IN ('admin-manual', 'class-bundle')
                ORDER BY created_at ASC")
            ->fetchAll();
        $insert = $pdo->prepare(
            'INSERT IGNORE INTO payment_snapshots
            (id, source, source_label, order_code, buyer_name, buyer_email, member_id, product_id, product_title, item_type, amount, status, payment_method, access_granted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );

        foreach ($accessRows as $access) {
            $productId = clean_text($access['product_id'] ?? '', 120);

            if ($productId === '' || empty($products[$productId])) {
                continue;
            }

            $memberId = clean_text($access['member_id'] ?? '', 120);
            $buyerEmail = clean_email($access['buyer_email'] ?? '');
            $pairKey = payment_product_pair_key($memberId, $buyerEmail, $productId);

            if (!empty($existingPairs[$pairKey])) {
                continue;
            }

            $product = $products[$productId];
            $source = strtolower(clean_text($access['source'] ?? '', 80));
            $isLynk = strpos($source, 'lynk') !== false;
            $snapshotId = 'legacy-product-' . substr(hash('sha256', $pairKey), 0, 40);
            $fallbackOrderCode = ($isLynk ? 'LYNK-PRODUCT-' : 'PRODUCT-ACCESS-')
                . strtoupper(substr(hash('sha256', $pairKey), 0, 10));

            $insert->execute([
                $snapshotId,
                $isLynk ? 'legacy_lynk_product_access' : 'legacy_product_access',
                $isLynk ? 'Akses produk / Lynk.id' : 'Akses produk digital',
                clean_text($access['order_id'] ?? '', 180) ?: $fallbackOrderCode,
                clean_text($access['buyer_name'] ?? 'Pelanggan', 160),
                $buyerEmail,
                $memberId,
                $productId,
                clean_text($access['product_title'] ?? ($product['title'] ?? 'Produk digital'), 180),
                'digital_product',
                0,
                'paid',
                $isLynk ? 'Lynk.id' : clean_text($access['source'] ?? 'Produk digital', 80),
                1,
                payment_snapshot_created_at($access),
            ]);
            $existingPairs[$pairKey] = true;
        }
    } catch (Throwable $error) {
        // Payment list should still load even if legacy product backfill is blocked.
    }
}

function payment_public(array $row): array
{
    $itemType = clean_text($row['itemType'] ?? ($row['item_type'] ?? 'class'), 40);
    $productTitle = clean_text($row['productTitle'] ?? ($row['product_title'] ?? ''), 180);
    $classTitle = clean_text($row['classTitle'] ?? ($row['class_title'] ?? ''), 180);
    $itemTitle = clean_text($row['itemTitle'] ?? ($row['item_title'] ?? ''), 180);

    if ($itemTitle === '') {
        $itemTitle = $itemType === 'digital_product' && $productTitle !== ''
            ? $productTitle
            : $classTitle;
    }

    if ($itemTitle === '') {
        $itemTitle = $itemType === 'digital_product' ? 'Produk digital' : 'Kelas';
    }

    if ($classTitle === '' || ($classTitle === 'Kelas' && $itemTitle !== 'Kelas')) {
        $classTitle = $itemTitle;
    }

    return [
        'id' => clean_text($row['id'] ?? make_id('payment'), 240),
        'source' => clean_text($row['source'] ?? '', 80),
        'sourceLabel' => clean_text($row['sourceLabel'] ?? ($row['source_label'] ?? 'Pembayaran'), 120),
        'orderCode' => clean_text($row['orderCode'] ?? ($row['order_code'] ?? ''), 180),
        'merchantRef' => clean_text($row['merchantRef'] ?? ($row['merchant_ref'] ?? ''), 180),
        'reference' => clean_text($row['reference'] ?? '', 180),
        'buyerName' => clean_text($row['buyerName'] ?? ($row['buyer_name'] ?? 'Member'), 160),
        'buyerEmail' => clean_email($row['buyerEmail'] ?? ($row['buyer_email'] ?? '')),
        'memberId' => clean_text($row['memberId'] ?? ($row['member_id'] ?? ''), 120),
        'classId' => clean_text($row['classId'] ?? ($row['class_id'] ?? ''), 120),
        'itemType' => $itemType,
        'productId' => clean_text($row['productId'] ?? ($row['product_id'] ?? ''), 120),
        'productTitle' => $productTitle,
        'classTitle' => $classTitle,
        'itemTitle' => $itemTitle,
        'amount' => (int) ($row['amount'] ?? 0),
        'status' => clean_text($row['status'] ?? 'pending', 40),
        'paymentMethod' => clean_text($row['paymentMethod'] ?? ($row['payment_method'] ?? ($row['sourceLabel'] ?? '-')), 120),
        'checkoutUrl' => clean_asset_url($row['checkoutUrl'] ?? ($row['checkout_url'] ?? ''), 1000),
        'accessGranted' => !empty($row['accessGranted']) || !empty($row['access_granted']),
        'expiresAt' => clean_text($row['expiresAt'] ?? '', 80),
        'expiresAtTimestamp' => (int) ($row['expiresAtTimestamp'] ?? ($row['expires_at_timestamp'] ?? 0)),
        'isExpired' => !empty($row['isExpired']),
        'createdAt' => clean_text($row['createdAt'] ?? ($row['created_at'] ?? ''), 80),
        'updatedAt' => clean_text($row['updatedAt'] ?? ($row['updated_at'] ?? ''), 80),
    ];
}

function payment_display_is_generic(string $value): bool
{
    $value = strtolower(trim($value));
    $normalized = payment_normalize_key($value);

    return in_array($value, [
        '',
        'kelas',
        'produk digital',
        'pembayaran lynk.id',
        'pembeli lynk.id',
        'member',
        'pelanggan',
    ], true) || in_array($normalized, [
        '',
        'kelas',
        'produk-digital',
        'pembayaran-lynk-id',
        'pembeli-lynk-id',
        'member',
        'pelanggan',
    ], true);
}

function payment_is_revenue_payment(array $payment): bool
{
    $status = strtolower(clean_text($payment['status'] ?? '', 40));

    if ($status === 'unmapped') {
        return false;
    }

    return !empty($payment['accessGranted'])
        || in_array($status, ['paid', 'processed', 'success', 'settlement'], true);
}

function payment_row_score(array $payment): int
{
    $score = 0;

    if (payment_is_revenue_payment($payment)) {
        $score += 60;
    }

    if ((int) ($payment['amount'] ?? 0) > 0) {
        $score += 40;
    }

    if (!payment_display_is_generic((string) ($payment['itemTitle'] ?? $payment['classTitle'] ?? ''))) {
        $score += 30;
    }

    if (!payment_display_is_generic((string) ($payment['buyerName'] ?? ''))) {
        $score += 20;
    }

    if (!empty($payment['accessGranted'])) {
        $score += 5;
    }

    if (($payment['source'] ?? '') === 'lynk') {
        $score += 3;
    }

    return $score;
}

function payment_date_key($value): string
{
    $time = strtotime((string) $value);

    return $time ? date('Y-m-d', $time) : '';
}

function payment_item_key(array $payment): string
{
    foreach (['productId', 'classId', 'itemTitle', 'productTitle', 'classTitle'] as $key) {
        $value = payment_normalize_key($payment[$key] ?? '');

        if ($value !== '' && !payment_display_is_generic($value)) {
            return $value;
        }
    }

    return '';
}

function payment_buyer_key(array $payment): string
{
    $memberId = payment_normalize_key($payment['memberId'] ?? '');

    if ($memberId !== '') {
        return 'member:' . $memberId;
    }

    $email = strtolower(clean_email($payment['buyerEmail'] ?? ''));

    if ($email !== '') {
        return 'email:' . $email;
    }

    return '';
}

function payment_dedupe_keys(array $payment): array
{
    $keys = [];

    foreach (['orderCode', 'merchantRef', 'reference'] as $key) {
        $value = payment_normalize_key($payment[$key] ?? '');

        if ($value !== '') {
            $keys[] = 'order:' . $value;
        }
    }

    $buyerKey = payment_buyer_key($payment);
    $itemKey = payment_item_key($payment);
    $dateKey = payment_date_key($payment['createdAt'] ?? '');
    $amount = (int) ($payment['amount'] ?? 0);

    if ($buyerKey !== '' && $itemKey !== '' && $dateKey !== '') {
        $keys[] = 'buyer-item-day:' . $buyerKey . ':' . $itemKey . ':' . $dateKey;

        if ($amount > 0) {
            $keys[] = 'buyer-item-amount-day:' . $buyerKey . ':' . $itemKey . ':' . $amount . ':' . $dateKey;
        }
    }

    return array_values(array_unique($keys));
}

function payment_dedupe_rows(array $payments): array
{
    $groups = [];
    $groupKeys = [];
    $keyToGroup = [];
    $withoutKey = [];

    foreach ($payments as $payment) {
        $keys = payment_dedupe_keys($payment);

        if (!$keys) {
            $withoutKey[] = $payment;
            continue;
        }

        $matchedGroupIds = [];

        foreach ($keys as $key) {
            if (isset($keyToGroup[$key])) {
                $matchedGroupIds[$keyToGroup[$key]] = true;
            }
        }

        $groupId = array_key_first($matchedGroupIds);

        if ($groupId === null) {
            $groupId = 'group-' . count($groups);
            $groups[$groupId] = $payment;
            $groupKeys[$groupId] = [];
        } elseif (payment_row_score($payment) > payment_row_score($groups[$groupId])) {
            $groups[$groupId] = $payment;
        }

        foreach (array_keys($matchedGroupIds) as $matchedGroupId) {
            if ($matchedGroupId === $groupId) {
                continue;
            }

            if (!empty($groups[$matchedGroupId]) && payment_row_score($groups[$matchedGroupId]) > payment_row_score($groups[$groupId])) {
                $groups[$groupId] = $groups[$matchedGroupId];
            }

            foreach ($groupKeys[$matchedGroupId] ?? [] as $matchedKey) {
                $groupKeys[$groupId][$matchedKey] = true;
                $keyToGroup[$matchedKey] = $groupId;
            }

            unset($groups[$matchedGroupId], $groupKeys[$matchedGroupId]);
        }

        foreach ($keys as $key) {
            $groupKeys[$groupId][$key] = true;
            $keyToGroup[$key] = $groupId;
        }
    }

    return array_values(array_merge($groups, $withoutKey));
}

function payment_ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    try {
        $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $query->execute([$column]);

        if (!$query->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD `$column` $definition");
        }
    } catch (Throwable $error) {
        // Older hosting or limited DB users should not block the payment list.
    }
}

function payment_ensure_runtime_schema(PDO $pdo): void
{
    payment_ensure_column($pdo, 'payment_snapshots', 'source', "VARCHAR(80) NOT NULL DEFAULT 'legacy_access'");
    payment_ensure_column($pdo, 'payment_snapshots', 'source_label', "VARCHAR(80) NOT NULL DEFAULT 'Akses lama'");
    payment_ensure_column($pdo, 'payment_snapshots', 'order_code', "VARCHAR(180) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'buyer_name', "VARCHAR(160) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'buyer_email', "VARCHAR(180) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'member_id', "VARCHAR(120) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'class_id', "VARCHAR(120) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'class_title', "VARCHAR(180) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'product_id', "VARCHAR(120) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'product_title', "VARCHAR(180) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'payment_snapshots', 'item_type', "VARCHAR(40) NOT NULL DEFAULT 'class'");
    payment_ensure_column($pdo, 'payment_snapshots', 'amount', 'INT NOT NULL DEFAULT 0');
    payment_ensure_column($pdo, 'payment_snapshots', 'status', "VARCHAR(40) NOT NULL DEFAULT 'paid'");
    payment_ensure_column($pdo, 'payment_snapshots', 'payment_method', "VARCHAR(80) NOT NULL DEFAULT 'Akses kelas'");
    payment_ensure_column($pdo, 'payment_snapshots', 'access_granted', 'TINYINT(1) NOT NULL DEFAULT 1');
    payment_ensure_column($pdo, 'payment_snapshots', 'created_at', "VARCHAR(60) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'lynk_orders', 'product_key', "VARCHAR(240) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'lynk_orders', 'product_name', "VARCHAR(240) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'lynk_orders', 'email_sent', 'TINYINT(1) NOT NULL DEFAULT 0');
    payment_ensure_column($pdo, 'lynk_orders', 'email_error', "VARCHAR(260) NOT NULL DEFAULT ''");
    payment_ensure_column($pdo, 'lynk_orders', 'email_sent_at', 'DATETIME NULL');
    payment_ensure_column($pdo, 'lynk_orders', 'payload', 'MEDIUMTEXT');
}

function payment_repair_derived_snapshot_amounts(PDO $pdo): void
{
    try {
        $pdo->exec(
            "UPDATE payment_snapshots
            SET amount = 0
            WHERE source IN ('legacy_lynk_access', 'legacy_lynk_product_access', 'legacy_product_access')",
        );
    } catch (Throwable $error) {
        // Continue. The public list can still avoid current-price fallbacks below.
    }

    try {
        $snapshots = $pdo
            ->query("SELECT id, order_code FROM payment_snapshots WHERE source = 'lynk_product'")
            ->fetchAll();
        $findOrder = $pdo->prepare('SELECT payload FROM lynk_orders WHERE order_id = ? LIMIT 1');
        $updateSnapshot = $pdo->prepare('UPDATE payment_snapshots SET amount = ? WHERE id = ?');

        foreach ($snapshots as $snapshot) {
            $orderCode = clean_text($snapshot['order_code'] ?? '', 180);

            if ($orderCode === '') {
                $updateSnapshot->execute([0, $snapshot['id']]);
                continue;
            }

            $findOrder->execute([$orderCode]);
            $order = $findOrder->fetch();
            $payload = $order ? payment_order_payload($order) : [];
            $amount = payment_amount_from_payload($payload);

            $updateSnapshot->execute([$amount, $snapshot['id']]);
        }
    } catch (Throwable $error) {
        // Continue. Missing payload means the exact old price is unknown.
    }
}

$payments = [];
payment_ensure_runtime_schema($pdo);
payment_repair_derived_snapshot_amounts($pdo);

try {
    $expiredMinutes = clean_number($config['tripay_expired_minutes'] ?? 1440, 5, 10080);
    $query = ($user['role'] ?? '') === 'admin'
        ? $pdo->query('SELECT * FROM tripay_orders ORDER BY created_at DESC LIMIT 2000')
        : (function () use ($pdo, $user) {
            $q = $pdo->prepare('SELECT * FROM tripay_orders WHERE member_id = ? ORDER BY created_at DESC LIMIT 500');
            $q->execute([$user['userId'] ?? '']);
            return $q;
        })();

    foreach ($query->fetchAll() as $row) {
        $payload = payment_order_payload($row);
        $status = strtolower(clean_text($row['status'] ?? 'pending', 40));

        if (($user['role'] ?? '') !== 'admin') {
            [$row, $payload] = payment_sync_pending_tripay_order($pdo, $config, $row, $payload);
            $status = strtolower(clean_text($row['status'] ?? $status, 40));
        }

        $isProduct = clean_text($payload['order_type'] ?? '', 60) === 'digital_product';
        $expiresAt = payment_tripay_expires_at($row, $payload, $expiredMinutes);
        $isExpired = payment_is_pending_status($status)
            && empty($row['access_granted'])
            && $expiresAt > 0
            && $expiresAt <= time();

        if ($isExpired) {
            $row['status'] = 'expired';

            try {
                $markExpired = $pdo->prepare(
                    "UPDATE tripay_orders SET status = ? WHERE id = ? AND status IN ('pending', 'unpaid', 'waiting', 'callback')",
                );
                $markExpired->execute(['expired', $row['id']]);
            } catch (Throwable $error) {
                // The public response can still mark it expired even if DB update is blocked.
            }
        }

        $payments[] = payment_public(array_merge($row, [
            'source' => 'tripay',
            'sourceLabel' => 'Tripay',
            'orderCode' => $row['merchant_ref'] ?: $row['reference'],
            'itemType' => $isProduct ? 'digital_product' : 'class',
            'productId' => $isProduct ? clean_text($payload['product_id'] ?? '', 120) : '',
            'productTitle' => $isProduct ? clean_text($payload['product_title'] ?? $row['class_title'], 180) : '',
            'paymentMethod' => clean_text($payload['payment_name'] ?? $payload['payment_method'] ?? 'Tripay', 120),
            'accessGranted' => !empty($row['access_granted']),
            'expiresAt' => $expiresAt > 0 ? date(DATE_ATOM, $expiresAt) : '',
            'expiresAtTimestamp' => $expiresAt,
            'isExpired' => $isExpired,
        ]));
    }
} catch (Throwable $error) {
    // Continue with other sources.
}

if (($user['role'] ?? '') === 'admin') {
    payment_backfill_member_access_snapshots($pdo);
    payment_backfill_product_access_snapshots($pdo);
}

try {
    $query = ($user['role'] ?? '') === 'admin'
        ? $pdo->query('SELECT * FROM payment_snapshots ORDER BY created_at DESC LIMIT 2000')
        : (function () use ($pdo, $user) {
            $q = $pdo->prepare('SELECT * FROM payment_snapshots WHERE member_id = ? ORDER BY created_at DESC LIMIT 500');
            $q->execute([$user['userId'] ?? '']);
            return $q;
        })();

    foreach ($query->fetchAll() as $row) {
        $payments[] = payment_public($row);
    }
} catch (Throwable $error) {
    // Continue.
}

if (($user['role'] ?? '') === 'admin') {
    try {
        $classMap = payment_fetch_class_map($pdo);
        $productMap = payment_fetch_product_map($pdo);

        foreach ($pdo->query('SELECT * FROM lynk_orders ORDER BY created_at DESC LIMIT 1000')->fetchAll() as $row) {
            $classIds = json_decode((string) ($row['class_ids'] ?? '[]'), true);
            $classIds = is_array($classIds) ? array_values(array_filter(array_map(static function ($classId): string {
                return clean_text($classId, 120);
            }, $classIds))) : [];
            $payload = payment_order_payload($row);
            $amount = payment_amount_from_payload($payload);
            $payloadBuyerName = payment_buyer_name_from_payload($payload);
            $payloadProductName = payment_product_name_from_payload($payload);
            $productCandidates = array_filter([
                $row['product_key'] ?? '',
                $row['product_name'] ?? '',
                $payloadProductName,
                payment_payload_value($payload, ['product.id', 'product.code', 'product.sku', 'data.product.id', 'data.product.code', 'data.product.sku']),
            ]);
            $mappedProducts = payment_find_products_by_candidates($productMap, $productCandidates);
            $mappedClassTitles = [];
            $mappedProductTitles = [];

            foreach ($classIds as $classId) {
                if (empty($classMap[$classId])) {
                    continue;
                }

                $mappedClassTitles[] = clean_text($classMap[$classId]['title'] ?? '', 180);
            }

            foreach ($mappedProducts as $product) {
                $mappedProductTitles[] = clean_text($product['title'] ?? '', 180);
            }

            $status = clean_text($row['status'] ?? '', 40);
            $isProductOrder = $status === 'product_processed' || (!$classIds && ($mappedProducts || $payloadProductName !== ''));
            $productName = clean_text(
                implode(', ', array_filter($isProductOrder ? $mappedProductTitles : $mappedClassTitles))
                    ?: implode(', ', array_filter($mappedClassTitles))
                    ?: implode(', ', array_filter($mappedProductTitles))
                    ?: $payloadProductName
                    ?: ($row['product_name'] ?: 'Pembayaran Lynk.id'),
                180,
            );
            $payments[] = payment_public(array_merge($row, [
                'id' => 'lynk:' . $row['id'],
                'source' => 'lynk',
                'sourceLabel' => 'Lynk.id',
                'orderCode' => $row['order_id'],
                'buyerName' => $payloadBuyerName ?: ($row['buyer_name'] ?? 'Pembeli Lynk.id'),
                'classId' => clean_text($classIds[0] ?? '', 120),
                'itemType' => $isProductOrder ? 'digital_product' : 'class',
                'productId' => $isProductOrder ? clean_text($mappedProducts[0]['id'] ?? '', 120) : '',
                'productTitle' => $isProductOrder ? $productName : '',
                'classTitle' => $productName,
                'itemTitle' => $productName,
                'amount' => $amount,
                'paymentMethod' => 'Lynk.id',
                'accessGranted' => in_array($status, ['processed', 'product_processed'], true),
            ]));
        }
    } catch (Throwable $error) {
        // Continue.
    }
}

$payments = payment_dedupe_rows($payments);

usort($payments, static function (array $first, array $second): int {
    return (strtotime($second['createdAt'] ?? '') ?: 0) <=> (strtotime($first['createdAt'] ?? '') ?: 0);
});

send_json(200, [
    'payments' => array_values($payments),
    'updatedAt' => updated_at($pdo),
]);
