<?php

require __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email.php';
require_once __DIR__ . '/_tripay.php';
require_once __DIR__ . '/_commerce.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!in_array($method, ['GET', 'POST'], true)) {
    send_json(405, ['message' => 'Method tidak diizinkan.']);
}

$config = api_config();
$secret = (string) ($config['lynk_webhook_secret'] ?? '');
$rawBody = file_get_contents('php://input') ?: '';
$payload = json_decode($rawBody, true);
$givenSecret = clean_text($_GET['secret'] ?? '', 240);
$authHeader = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');

if ($givenSecret === '') {
    $givenSecret = clean_text($_SERVER['HTTP_X_LYNK_WEBHOOK_SECRET'] ?? '', 240);
}

if ($givenSecret === '') {
    $givenSecret = clean_text($_SERVER['HTTP_X_WEBHOOK_SECRET'] ?? '', 240);
}

if ($givenSecret === '') {
    $givenSecret = clean_text($_SERVER['HTTP_X_MERCHANT_KEY'] ?? '', 240);
}

if ($givenSecret === '') {
    $givenSecret = clean_text($_SERVER['HTTP_MERCHANT_KEY'] ?? '', 240);
}

if ($givenSecret === '' && stripos($authHeader, 'Bearer ') === 0) {
    $givenSecret = clean_text(substr($authHeader, 7), 240);
}

if (is_array($payload)) {
    foreach (['merchant_key', 'merchantKey', 'merchantKeyId', 'merchant.key', 'data.merchant_key', 'data.merchantKey'] as $path) {
        if ($givenSecret !== '') {
            break;
        }

        $current = $payload;

        foreach (explode('.', $path) as $segment) {
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                $current = null;
                break;
            }

            $current = $current[$segment];
        }

        if (is_scalar($current)) {
            $givenSecret = clean_text($current, 240);
        }
    }
}

function lynk_valid_signature(string $rawBody, string $secret): bool
{
    $headers = [
        $_SERVER['HTTP_X_LYNK_SIGNATURE'] ?? '',
        $_SERVER['HTTP_X_SIGNATURE'] ?? '',
        $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '',
        $_SERVER['HTTP_SIGNATURE'] ?? '',
    ];
    $expectedHex = hash_hmac('sha256', $rawBody, $secret);
    $expectedBase64 = base64_encode(hash_hmac('sha256', $rawBody, $secret, true));

    foreach ($headers as $header) {
        $signature = trim((string) $header);

        if ($signature === '') {
            continue;
        }

        $signature = preg_replace('/^sha256=/i', '', $signature) ?? $signature;

        if (hash_equals($expectedHex, $signature) || hash_equals($expectedBase64, $signature)) {
            return true;
        }
    }

    return false;
}

if ($secret === '') {
    send_json(500, ['message' => 'Merchant Key Lynk.id belum diisi di config website.']);
}

if ($method === 'GET') {
    if ($givenSecret === '' || !hash_equals($secret, $givenSecret)) {
        send_json(401, ['message' => 'Secret webhook Lynk.id tidak valid.']);
    }

    send_json(200, [
        'ok' => true,
        'message' => 'Webhook Lynk.id aktif. Gunakan POST dari Lynk.id untuk memproses order.',
        'webhookUrl' => '/api/lynk-webhook.php?secret=***',
        'extensionlessUrlSupported' => true,
        'resendConfigured' => !empty($config['resend_api_key']) && !empty($config['resend_from_email']),
        'curlEnabled' => function_exists('curl_init'),
    ]);
}

if (!is_array($payload)) {
    send_json(400, ['message' => 'Payload webhook tidak valid.']);
}

if (!hash_equals($secret, $givenSecret) && !lynk_valid_signature($rawBody, $secret)) {
    send_json(401, ['message' => 'Merchant Key webhook Lynk.id tidak valid.']);
}

$pdo = db();

function lynk_normalize_key($value): string
{
    $key = strtolower(clean_text($value, 240));
    $key = preg_replace('/[^a-z0-9]+/', '-', $key) ?? '';

    return trim($key, '-');
}

function lynk_flatten_values($value): array
{
    if (!is_array($value)) {
        return [$value];
    }

    $values = [];

    foreach ($value as $item) {
        $values = array_merge($values, lynk_flatten_values($item));
    }

    return $values;
}

function lynk_first_value(array $payload, array $paths): string
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
            return clean_text($current, 240);
        }
    }

    return '';
}

function lynk_nested_array(array $payload, string $path): array
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

function lynk_first_email($value): string
{
    foreach (lynk_flatten_values($value) as $item) {
        $email = clean_email($item);

        if ($email !== '') {
            return $email;
        }
    }

    return '';
}

function lynk_first_phone(array $payload): string
{
    return clean_phone(lynk_first_value($payload, [
        'buyer.phone',
        'buyer.phone_number',
        'buyer.whatsapp',
        'customer.phone',
        'customer.phone_number',
        'customer.whatsapp',
        'user.phone',
        'user.phone_number',
        'order.customer_phone',
        'data.buyer.phone',
        'data.buyer.phone_number',
        'data.buyer.whatsapp',
        'data.customer.phone',
        'data.customer.phone_number',
        'data.customer.whatsapp',
        'data.message_data.customer.phone',
        'data.message_data.customer.phone_number',
        'data.message_data.customer.whatsapp',
        'message_data.customer.phone',
        'message_data.customer.phone_number',
        'message_data.customer.whatsapp',
        'buyer_phone',
        'buyer_phone_number',
        'customer_phone',
        'customer_phone_number',
        'phone',
        'phone_number',
        'telephone',
        'whatsapp',
        'wa',
    ]));
}

function lynk_name_from_field_groups(array $payload): string
{
    foreach ([
        'custom_fields',
        'customFields',
        'fields',
        'answers',
        'form',
        'form_data',
        'formData',
        'customer_fields',
        'customerFields',
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
        'data.customer_fields',
        'data.customerFields',
        'data.message_data.custom_fields',
        'data.message_data.fields',
        'data.message_data.answers',
    ] as $path) {
        $group = lynk_nested_array($payload, $path);

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

function lynk_first_name(array $payload): string
{
    $name = lynk_first_value($payload, [
        'buyer.name',
        'buyer.full_name',
        'buyer.fullName',
        'buyer_name',
        'buyer_full_name',
        'buyerFullName',
        'customer.name',
        'customer.full_name',
        'customer.fullName',
        'customer_name',
        'customer_full_name',
        'customerFullName',
        'user.name',
        'user.full_name',
        'user.fullName',
        'contact.name',
        'contact.full_name',
        'order.customer_name',
        'order.customer.full_name',
        'order.buyer_name',
        'order.buyer.name',
        'order.name',
        'transaction.customer_name',
        'transaction.buyer_name',
        'payment.customer_name',
        'payment.buyer_name',
        'checkout.customer_name',
        'checkout.name',
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
        'data.customer_name',
        'data.buyer_name',
        'data.user.name',
        'data.contact.name',
        'data.order.customer_name',
        'data.order.buyer_name',
        'data.transaction.customer_name',
        'data.payment.customer_name',
        'data.message_data.customer.name',
        'data.message_data.customer.full_name',
        'data.message_data.name',
        'data.messageData.customer.name',
        'data.messageData.name',
    ]);

    if ($name === '') {
        $name = lynk_name_from_field_groups($payload);
    }

    if ($name !== '' && !filter_var($name, FILTER_VALIDATE_EMAIL) && !preg_match('/https?:\/\//i', $name)) {
        return $name;
    }

    return '';
}

function lynk_amount_value($value): int
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

function lynk_amount_from_payload(array $payload): int
{
    $value = lynk_first_value($payload, [
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
        'order.amount',
        'order.total',
        'order.total_amount',
        'order.total_price',
        'order.grand_total',
        'invoice.amount',
        'invoice.total',
        'invoice.total_amount',
        'invoice.total_price',
        'invoice.grand_total',
        'payment.amount',
        'payment.total',
        'payment.total_amount',
        'transaction.amount',
        'transaction.total',
        'transaction.gross_amount',
        'data.amount',
        'data.total',
        'data.total_amount',
        'data.total_price',
        'data.grand_total',
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
        'data.invoice.amount',
        'data.invoice.total',
        'data.invoice.total_amount',
        'data.payment.amount',
        'data.payment.total',
        'data.transaction.amount',
        'data.transaction.total',
        'data.transaction.gross_amount',
    ]);
    $amount = lynk_amount_value($value);

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
        'data.cart.items',
        'data.invoice.items',
        'data.payment.items',
        'data.transaction.items',
        'data.message_data.items',
        'data.messageData.items',
    ] as $listPath) {
        foreach (lynk_nested_array($payload, $listPath) as $item) {
            if (!is_array($item)) {
                continue;
            }

            $itemAmount = lynk_amount_value(lynk_first_value($item, [
                'total',
                'total_amount',
                'total_price',
                'grand_total',
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

            $qty = lynk_amount_value(lynk_first_value($item, ['quantity', 'qty']));
            $sum += $itemAmount * max(1, $qty);
        }
    }

    return $sum;
}

function lynk_first_product_name(array $payload): string
{
    $name = lynk_first_value($payload, [
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

    if ($name !== '' && !filter_var($name, FILTER_VALIDATE_EMAIL) && !preg_match('/https?:\/\//i', $name)) {
        return clean_text($name, 240);
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
        'data.cart.items',
        'data.invoice.items',
        'data.payment.items',
        'data.transaction.items',
        'data.message_data.items',
        'data.messageData.items',
    ] as $listPath) {
        foreach (lynk_nested_array($payload, $listPath) as $item) {
            if (!is_array($item)) {
                continue;
            }

            $itemName = lynk_first_value($item, [
                'product.name',
                'product.title',
                'name',
                'title',
                'label',
                'product_name',
                'productName',
                'item_name',
                'itemName',
            ]);

            if ($itemName !== '' && !filter_var($itemName, FILTER_VALIDATE_EMAIL) && !preg_match('/https?:\/\//i', $itemName)) {
                return clean_text($itemName, 240);
            }
        }
    }

    return '';
}

function lynk_collect_product_candidates(array $payload): array
{
    $paths = [
        'product.id',
        'product.slug',
        'product.code',
        'product.sku',
        'product.product_code',
        'product.productCode',
        'product.product_key',
        'product.productKey',
        'product.external_id',
        'product.externalId',
        'product.name',
        'product.title',
        'product_id',
        'productId',
        'product_code',
        'productCode',
        'product_key',
        'productKey',
        'product_sku',
        'product_slug',
        'uuid',
        'refId',
        'ref_id',
        'message_id',
        'messageId',
        'product_name',
        'productName',
        'item.id',
        'item.uuid',
        'item.refId',
        'item.ref_id',
        'item.slug',
        'item.code',
        'item.sku',
        'item.product_code',
        'item.productCode',
        'item.product_key',
        'item.productKey',
        'item.name',
        'item.title',
        'item_id',
        'itemId',
        'item_name',
        'itemName',
        'link.id',
        'link.slug',
        'link.code',
        'page.id',
        'page.slug',
        'page.code',
        'message_data.refId',
        'message_data.ref_id',
        'message_data.message_id',
        'data.message_data.refId',
        'data.message_data.ref_id',
        'data.message_data.message_id',
        'messageData.refId',
        'messageData.ref_id',
        'messageData.messageId',
        'data.messageData.refId',
        'data.messageData.ref_id',
        'data.messageData.messageId',
        'sku',
        'code',
        'slug',
        'name',
        'title',
    ];
    $candidates = [];

    foreach ($paths as $path) {
        $value = lynk_first_value($payload, [$path]);

        if ($value !== '') {
            $candidates[] = $value;
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
        'order.order_items',
        'order.orderItems',
        'cart.items',
        'invoice.items',
        'payment.items',
        'transaction.items',
        'message_data.items',
        'message_data.order_items',
        'messageData.items',
        'messageData.orderItems',
        'data.items',
        'data.products',
        'data.line_items',
        'data.lineItems',
        'data.order_items',
        'data.orderItems',
        'data.message_data.items',
        'data.message_data.order_items',
        'data.messageData.items',
        'data.messageData.orderItems',
    ] as $listPath) {
        $items = lynk_nested_array($payload, $listPath);

        if (!$items) {
            continue;
        }

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            foreach ([
                'id',
                'uuid',
                'refId',
                'ref_id',
                'product_id',
                'productId',
                'product_code',
                'productCode',
                'product_key',
                'productKey',
                'sku',
                'code',
                'slug',
                'name',
                'title',
                'product_name',
                'productName',
                'item_name',
                'itemName',
                'product.id',
                'product.uuid',
                'product.refId',
                'product.ref_id',
                'product.code',
                'product.sku',
                'product.slug',
                'product.name',
                'product.title',
            ] as $key) {
                $value = strpos($key, '.') === false
                    ? ($item[$key] ?? null)
                    : lynk_first_value($item, [$key]);

                if (is_scalar($value) && trim((string) $value) !== '') {
                    $candidates[] = clean_text($value, 240);
                }
            }
        }
    }

    return array_values(array_unique(array_filter($candidates)));
}

function lynk_is_paid_event(array $payload): bool
{
    $statusValues = [];

    foreach (['event', 'type', 'status', 'payment_status', 'transaction_status', 'order_status'] as $key) {
        if (!empty($payload[$key]) && is_scalar($payload[$key])) {
            $statusValues[] = strtolower((string) $payload[$key]);
        }
    }

    foreach (['data', 'order', 'transaction', 'payment'] as $key) {
        if (!empty($payload[$key]) && is_array($payload[$key])) {
            foreach (['event', 'type', 'status', 'payment_status', 'transaction_status', 'order_status'] as $nestedKey) {
                if (!empty($payload[$key][$nestedKey]) && is_scalar($payload[$key][$nestedKey])) {
                    $statusValues[] = strtolower((string) $payload[$key][$nestedKey]);
                }
            }
        }
    }

    if (!$statusValues) {
        return true;
    }

    foreach ($statusValues as $status) {
        if (preg_match('/paid|payment\.received|payment_received|received|success|settled|complete|completed|berhasil|lunas|sukses/', $status)) {
            return true;
        }
    }

    return false;
}

function lynk_similarity_tokens(string $value): array
{
    $normalized = lynk_normalize_key($value);

    if ($normalized === '') {
        return [];
    }

    $tokens = preg_split('/-+/', $normalized) ?: [];
    $tokens = array_filter($tokens, static function ($token) {
        return strlen((string) $token) >= 2;
    });

    return array_values(array_unique($tokens));
}

function lynk_titles_are_similar(string $candidate, string $classTitle): bool
{
    $candidateTokens = lynk_similarity_tokens($candidate);
    $classTokens = lynk_similarity_tokens($classTitle);

    if (count($candidateTokens) < 4 || count($classTokens) < 4) {
        return false;
    }

    $shared = array_values(array_intersect($candidateTokens, $classTokens));
    $sharedCount = count($shared);

    if ($sharedCount < 4) {
        return false;
    }

    $candidateRatio = $sharedCount / max(1, count($candidateTokens));
    $classRatio = $sharedCount / max(1, count($classTokens));

    return $candidateRatio >= 0.58 || $classRatio >= 0.58;
}

function lynk_find_classes(PDO $pdo, array $payload, array $productCandidates, array $config): array
{
    $classes = $pdo
        ->query('SELECT id, title, status, lynk_product_key FROM classes ORDER BY id ASC')
        ->fetchAll();
    $map = is_array($config['lynk_product_class_map'] ?? null)
        ? $config['lynk_product_class_map']
        : [];
    $candidateKeys = array_values(array_unique(array_filter(array_map('lynk_normalize_key', $productCandidates))));
    $classIds = [];

    foreach ($map as $productKey => $mappedClassIds) {
        if (!in_array(lynk_normalize_key($productKey), $candidateKeys, true)) {
            continue;
        }

        foreach ((array) $mappedClassIds as $classId) {
            $classIds[] = clean_text($classId, 120);
        }
    }

    foreach ($classes as $class) {
        $keys = [
            lynk_normalize_key($class['id'] ?? ''),
            lynk_normalize_key($class['title'] ?? ''),
            lynk_normalize_key($class['lynk_product_key'] ?? ''),
        ];

        foreach ($candidateKeys as $candidateKey) {
            if ($candidateKey === '') {
                continue;
            }

            if (in_array($candidateKey, $keys, true)) {
                $classIds[] = $class['id'];
                continue 2;
            }

            foreach ($keys as $classKey) {
                if ($classKey !== '' && (strpos($candidateKey, $classKey) !== false || strpos($classKey, $candidateKey) !== false)) {
                    $classIds[] = $class['id'];
                    continue 3;
                }
            }

            $classTitle = clean_text($class['title'] ?? '', 240);

            if ($classTitle !== '' && lynk_titles_are_similar($candidateKey, $classTitle)) {
                $classIds[] = $class['id'];
                continue 2;
            }
        }
    }

    return array_values(array_unique(array_filter($classIds)));
}

function lynk_find_explicit_classes(PDO $pdo, array $productCandidates, array $config): array
{
    $map = is_array($config['lynk_product_class_map'] ?? null)
        ? $config['lynk_product_class_map']
        : [];
    $candidateKeys = array_values(array_unique(array_filter(array_map('lynk_normalize_key', $productCandidates))));
    $classIds = [];

    foreach ($map as $productKey => $mappedClassIds) {
        if (!in_array(lynk_normalize_key($productKey), $candidateKeys, true)) {
            continue;
        }

        foreach ((array) $mappedClassIds as $classId) {
            $classIds[] = clean_text($classId, 120);
        }
    }

    try {
        $classes = $pdo
            ->query("SELECT id, lynk_product_key FROM classes WHERE lynk_product_key <> '' ORDER BY id ASC")
            ->fetchAll();
    } catch (Throwable $error) {
        return array_values(array_unique(array_filter($classIds)));
    }

    foreach ($classes as $class) {
        $keys = [
            lynk_normalize_key($class['id'] ?? ''),
            lynk_normalize_key($class['lynk_product_key'] ?? ''),
        ];

        foreach ($candidateKeys as $candidateKey) {
            if ($candidateKey !== '' && in_array($candidateKey, $keys, true)) {
                $classIds[] = $class['id'];
                continue 2;
            }
        }
    }

    return array_values(array_unique(array_filter($classIds)));
}

function lynk_fetch_class_purchase_messages(PDO $pdo, array $classIds): array
{
    $classIds = array_values(array_unique(array_filter(array_map(static function ($classId) {
        return clean_text($classId, 120);
    }, $classIds))));

    if (!$classIds) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($classIds), '?'));

    try {
        $query = $pdo->prepare("SELECT id, title, purchase_message FROM classes WHERE id IN ({$placeholders})");
        $query->execute($classIds);
    } catch (Throwable $error) {
        return [];
    }

    $messages = [];

    foreach ($query->fetchAll() as $class) {
        $message = clean_text($class['purchase_message'] ?? '', 2000);

        $messages[] = [
            'classId' => clean_text($class['id'] ?? '', 120),
            'title' => clean_text($class['title'] ?? 'Kelas IbnuCreative', 180),
            'message' => $message,
        ];
    }

    return $messages;
}

function lynk_decode_class_ids($value): array
{
    $decoded = json_decode((string) ($value ?? '[]'), true);

    if (!is_array($decoded)) {
        return [];
    }

    return array_values(array_unique(array_filter(array_map(static function ($classId) {
        return clean_text($classId, 120);
    }, $decoded))));
}

function lynk_store_email_result(PDO $pdo, string $orderId, array $result): void
{
    if ($orderId === '') {
        return;
    }

    try {
        $update = $pdo->prepare(
            'UPDATE lynk_orders
            SET email_sent = ?, email_error = ?, email_sent_at = ?
            WHERE order_id = ?',
        );
        $sent = !empty($result['sent']);
        $update->execute([
            $sent ? 1 : 0,
            $sent ? '' : clean_text($result['message'] ?? 'Email Resend gagal dikirim.', 240),
            $sent ? date('Y-m-d H:i:s') : null,
            $orderId,
        ]);
    } catch (Throwable $error) {
        // Webhook must keep returning success to Lynk when access already exists.
    }
}

function lynk_retry_saved_class_email(PDO $pdo, array $savedOrder, array $config, string $secret): array
{
    if (($savedOrder['status'] ?? '') !== 'processed' || !empty($savedOrder['email_sent'])) {
        return ['attempted' => false, 'sent' => !empty($savedOrder['email_sent']), 'message' => 'Email sudah pernah berhasil atau order bukan kelas.'];
    }

    $email = clean_email($savedOrder['buyer_email'] ?? '');
    $classIds = lynk_decode_class_ids($savedOrder['class_ids'] ?? '[]');

    if ($email === '' || !$classIds) {
        return ['attempted' => false, 'sent' => false, 'message' => 'Data email atau kelas pada order lama tidak lengkap.'];
    }

    $password = !empty($savedOrder['password_created'])
        ? lynk_generated_password($email, $secret)
        : null;
    $account = [
        'name' => clean_text($savedOrder['buyer_name'] ?? 'Pembeli Lynk.id', 160),
        'email' => $email,
        'username' => clean_text($savedOrder['username'] ?? '', 120),
        'password' => $password,
        'loginUrl' => lynk_login_url($config),
        'classIds' => $classIds,
        'purchaseMessages' => lynk_fetch_class_purchase_messages($pdo, $classIds),
    ];
    $result = lynk_send_credentials_email(
        $email,
        $account['name'] ?: 'Pembeli Lynk.id',
        $account,
        $config,
    );

    lynk_store_email_result($pdo, clean_text($savedOrder['order_id'] ?? '', 180), $result);

    return [
        'attempted' => true,
        'sent' => !empty($result['sent']),
        'message' => !empty($result['sent']) ? 'Email berhasil dikirim ulang.' : ($result['message'] ?? 'Email Resend gagal dikirim.'),
    ];
}

function lynk_find_products(PDO $pdo, array $productCandidates): array
{
    try {
        $products = $pdo
            ->query('SELECT id, title, status, lynk_product_key FROM digital_products ORDER BY id ASC')
            ->fetchAll();
    } catch (Throwable $error) {
        return [];
    }

    $candidateKeys = array_values(array_unique(array_filter(array_map('lynk_normalize_key', $productCandidates))));
    $productIds = [];

    foreach ($products as $product) {
        $keys = [
            lynk_normalize_key($product['id'] ?? ''),
            lynk_normalize_key($product['title'] ?? ''),
            lynk_normalize_key($product['lynk_product_key'] ?? ''),
        ];

        foreach ($candidateKeys as $candidateKey) {
            if ($candidateKey === '') {
                continue;
            }

            if (in_array($candidateKey, $keys, true)) {
                $productIds[] = $product['id'];
                continue 2;
            }

            foreach ($keys as $productKey) {
                if ($productKey !== '' && (strpos($candidateKey, $productKey) !== false || strpos($productKey, $candidateKey) !== false)) {
                    $productIds[] = $product['id'];
                    continue 3;
                }
            }
        }
    }

    return array_values(array_unique(array_filter($productIds)));
}

function lynk_find_explicit_products(PDO $pdo, array $productCandidates): array
{
    try {
        $products = $pdo
            ->query("SELECT id, lynk_product_key FROM digital_products WHERE lynk_product_key <> '' ORDER BY id ASC")
            ->fetchAll();
    } catch (Throwable $error) {
        return [];
    }

    $candidateKeys = array_values(array_unique(array_filter(array_map('lynk_normalize_key', $productCandidates))));
    $productIds = [];

    foreach ($products as $product) {
        $keys = [
            lynk_normalize_key($product['id'] ?? ''),
            lynk_normalize_key($product['lynk_product_key'] ?? ''),
        ];

        foreach ($candidateKeys as $candidateKey) {
            if ($candidateKey !== '' && in_array($candidateKey, $keys, true)) {
                $productIds[] = $product['id'];
                continue 2;
            }
        }
    }

    return array_values(array_unique(array_filter($productIds)));
}

function lynk_snapshot_amount(array $item): int
{
    return 0;
}

function lynk_insert_product_payment_snapshot(PDO $pdo, array $product, array $access, string $orderId, int $paidAmount = 0): void
{
    try {
        $snapshotId = 'lynk-product-' . substr(hash('sha256', $orderId . '::' . ($product['id'] ?? '')), 0, 40);
        $insert = $pdo->prepare(
            'INSERT IGNORE INTO payment_snapshots
            (id, source, source_label, order_code, buyer_name, buyer_email, member_id, product_id, product_title, item_type, amount, status, payment_method, access_granted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $insert->execute([
            $snapshotId,
            'lynk_product',
            'Lynk.id',
            $orderId,
            clean_text($access['buyer_name'] ?? 'Pembeli Lynk.id', 160),
            clean_email($access['buyer_email'] ?? ''),
            clean_text($access['member_id'] ?? '', 120),
            clean_text($product['id'] ?? '', 120),
            clean_text($product['title'] ?? 'Produk digital', 180),
            'digital_product',
            max(0, $paidAmount),
            'paid',
            'Lynk.id',
            1,
            date('Y-m-d H:i:s'),
        ]);
    } catch (Throwable $error) {
        // Product access should stay active even if the payment snapshot cannot be written.
    }
}

function lynk_unique_username(PDO $pdo, string $email, string $name): string
{
    $base = clean_username(strstr($email, '@', true) ?: $name);

    if ($base === '') {
        $base = 'member';
    }

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

function lynk_generated_password(string $email, string $secret): string
{
    return 'IC-' . substr(hash_hmac('sha256', strtolower($email), $secret), 0, 10);
}

function lynk_login_url(array $config): string
{
    $configured = clean_external_url($config['site_login_url'] ?? '');

    if ($configured !== '') {
        return $configured;
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = clean_text($_SERVER['HTTP_HOST'] ?? '', 180);

    return $host ? $scheme . '://' . $host . '/login' : '/login';
}

function lynk_send_credentials_email(string $email, string $name, array $account, array $config): array
{
    if (empty($config['lynk_send_credentials_email'])) {
        return ['sent' => false, 'message' => 'Pengiriman email kredensial Lynk.id dinonaktifkan.'];
    }

    $loginUrl = clean_asset_url($account['loginUrl'] ?? lynk_login_url($config), 1000);
    $username = clean_text($account['username'] ?? '', 120);
    $purchaseMessages = is_array($account['purchaseMessages'] ?? null) ? $account['purchaseMessages'] : [];
    $classTitles = [];
    $purchaseMessageParts = [];

    foreach ($purchaseMessages as $messageItem) {
        if (!is_array($messageItem)) {
            continue;
        }

        $messageTitle = clean_text($messageItem['title'] ?? 'Kelas IbnuCreative', 180);
        $messageBody = clean_text($messageItem['message'] ?? '', 2000);
        $classTitles[] = $messageTitle;

        if ($messageBody === '') {
            continue;
        }

        $purchaseMessageParts[] = count($purchaseMessages) > 1
            ? $messageTitle . "\n" . $messageBody
            : $messageBody;
    }

    $classTitles = array_values(array_unique(array_filter($classTitles)));
    $classTitleText = $classTitles ? implode(', ', $classTitles) : 'Kelas IbnuCreative';

    return send_class_access_credentials_email([
        'buyerName' => $name ?: 'Pembeli Lynk.id',
        'buyerEmail' => $email,
        'username' => $username,
        'password' => $account['password'] ?? '',
        'classTitle' => $classTitleText,
        'purchaseMessage' => implode("\n\n", $purchaseMessageParts),
        'loginUrl' => $loginUrl,
    ]);
}

function lynk_ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    try {
        $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $query->execute([$column]);

        if (!$query->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD `$column` $definition");
        }
    } catch (Throwable $error) {
        // Webhook should continue even if a hosting DB user cannot alter columns.
    }
}

function lynk_ensure_tables(PDO $pdo): void
{
    try {
        $accountQuery = $pdo->prepare('SHOW COLUMNS FROM accounts LIKE ?');
        $accountQuery->execute(['phone']);

        if (!$accountQuery->fetch()) {
            $pdo->exec("ALTER TABLE accounts ADD phone VARCHAR(40) NOT NULL DEFAULT '' AFTER email");
        }

        $query = $pdo->prepare('SHOW COLUMNS FROM classes LIKE ?');
        $query->execute(['lynk_product_key']);

        if (!$query->fetch()) {
            $pdo->exec("ALTER TABLE classes ADD lynk_product_key VARCHAR(180) NOT NULL DEFAULT '' AFTER revenue");
        }

        $query->execute(['purchase_message']);

        if (!$query->fetch()) {
            $pdo->exec('ALTER TABLE classes ADD purchase_message LONGTEXT NULL AFTER register_button_label');
        }
    } catch (Throwable $error) {
        // Installer can add this column if runtime ALTER is blocked.
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS lynk_orders (
            id VARCHAR(120) PRIMARY KEY,
            event_id VARCHAR(180) NOT NULL DEFAULT '',
            order_id VARCHAR(180) NOT NULL DEFAULT '',
            buyer_name VARCHAR(160) NOT NULL DEFAULT '',
            buyer_email VARCHAR(180) NOT NULL DEFAULT '',
            product_key VARCHAR(240) NOT NULL DEFAULT '',
            product_name VARCHAR(240) NOT NULL DEFAULT '',
            class_ids MEDIUMTEXT,
            member_id VARCHAR(120) NOT NULL DEFAULT '',
            username VARCHAR(80) NOT NULL DEFAULT '',
            password_created TINYINT(1) NOT NULL DEFAULT 0,
            email_sent TINYINT(1) NOT NULL DEFAULT 0,
            email_error VARCHAR(260) NOT NULL DEFAULT '',
            email_sent_at DATETIME NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'processed',
            payload MEDIUMTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY lynk_order_unique (order_id),
            INDEX lynk_order_email_index (buyer_email),
            INDEX lynk_order_member_index (member_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS digital_product_access (
            id VARCHAR(160) PRIMARY KEY,
            product_id VARCHAR(120) NOT NULL DEFAULT '',
            product_title VARCHAR(180) NOT NULL DEFAULT '',
            member_id VARCHAR(120) NOT NULL DEFAULT '',
            buyer_name VARCHAR(160) NOT NULL DEFAULT '',
            buyer_email VARCHAR(180) NOT NULL DEFAULT '',
            source VARCHAR(80) NOT NULL DEFAULT '',
            order_id VARCHAR(180) NOT NULL DEFAULT '',
            status VARCHAR(40) NOT NULL DEFAULT 'active',
            download_url MEDIUMTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX digital_product_access_member_index (member_id),
            INDEX digital_product_access_email_index (buyer_email),
            INDEX digital_product_access_product_index (product_id),
            INDEX digital_product_access_order_index (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS payment_snapshots (
            id VARCHAR(240) PRIMARY KEY,
            source VARCHAR(80) NOT NULL DEFAULT 'legacy_access',
            source_label VARCHAR(80) NOT NULL DEFAULT 'Akses lama',
            order_code VARCHAR(180) NOT NULL DEFAULT '',
            buyer_name VARCHAR(160) NOT NULL DEFAULT '',
            buyer_email VARCHAR(180) NOT NULL DEFAULT '',
            member_id VARCHAR(120) NOT NULL DEFAULT '',
            class_id VARCHAR(120) NOT NULL DEFAULT '',
            class_title VARCHAR(180) NOT NULL DEFAULT '',
            product_id VARCHAR(120) NOT NULL DEFAULT '',
            product_title VARCHAR(180) NOT NULL DEFAULT '',
            item_type VARCHAR(40) NOT NULL DEFAULT 'class',
            amount INT NOT NULL DEFAULT 0,
            status VARCHAR(40) NOT NULL DEFAULT 'paid',
            payment_method VARCHAR(80) NOT NULL DEFAULT 'Akses kelas',
            access_granted TINYINT(1) NOT NULL DEFAULT 1,
            created_at VARCHAR(60) NOT NULL DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX payment_snapshot_member_index (member_id),
            INDEX payment_snapshot_class_index (class_id),
            INDEX payment_snapshot_product_index (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );

    lynk_ensure_column($pdo, 'lynk_orders', 'product_key', "VARCHAR(240) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'lynk_orders', 'product_name', "VARCHAR(240) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'lynk_orders', 'email_sent', 'TINYINT(1) NOT NULL DEFAULT 0');
    lynk_ensure_column($pdo, 'lynk_orders', 'email_error', "VARCHAR(260) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'lynk_orders', 'email_sent_at', 'DATETIME NULL');
    lynk_ensure_column($pdo, 'lynk_orders', 'payload', 'MEDIUMTEXT');
    lynk_ensure_column($pdo, 'payment_snapshots', 'source', "VARCHAR(80) NOT NULL DEFAULT 'legacy_access'");
    lynk_ensure_column($pdo, 'payment_snapshots', 'source_label', "VARCHAR(80) NOT NULL DEFAULT 'Akses lama'");
    lynk_ensure_column($pdo, 'payment_snapshots', 'order_code', "VARCHAR(180) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'buyer_name', "VARCHAR(160) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'buyer_email', "VARCHAR(180) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'member_id', "VARCHAR(120) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'class_id', "VARCHAR(120) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'class_title', "VARCHAR(180) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'product_id', "VARCHAR(120) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'product_title', "VARCHAR(180) NOT NULL DEFAULT ''");
    lynk_ensure_column($pdo, 'payment_snapshots', 'item_type', "VARCHAR(40) NOT NULL DEFAULT 'class'");
    lynk_ensure_column($pdo, 'payment_snapshots', 'amount', 'INT NOT NULL DEFAULT 0');
    lynk_ensure_column($pdo, 'payment_snapshots', 'status', "VARCHAR(40) NOT NULL DEFAULT 'paid'");
    lynk_ensure_column($pdo, 'payment_snapshots', 'payment_method', "VARCHAR(80) NOT NULL DEFAULT 'Akses kelas'");
    lynk_ensure_column($pdo, 'payment_snapshots', 'access_granted', 'TINYINT(1) NOT NULL DEFAULT 1');
    lynk_ensure_column($pdo, 'payment_snapshots', 'created_at', "VARCHAR(60) NOT NULL DEFAULT ''");
}

lynk_ensure_tables($pdo);

$data = is_array($payload['data'] ?? null) ? $payload['data'] : $payload;
$eventId = lynk_first_value($payload, ['id', 'event_id', 'webhook_id', 'data.id']);
$orderId = lynk_first_value($payload, [
    'order_id',
    'order.id',
    'transaction_id',
    'transaction.id',
    'invoice_id',
    'invoice.id',
    'payment_id',
    'payment.id',
    'data.order_id',
    'data.transaction_id',
    'data.invoice_id',
]);
$buyerEmail = lynk_first_email($payload);
$buyerPhone = lynk_first_phone($payload);
$buyerName = lynk_first_name($payload);
$productCandidates = array_values(array_unique(array_merge(
    lynk_collect_product_candidates($payload),
    lynk_collect_product_candidates($data),
)));
$productKey = clean_text($productCandidates[0] ?? '', 240);
$productDisplayName = lynk_first_product_name($payload) ?: lynk_first_product_name($data);
$paidAmount = lynk_amount_from_payload($payload) ?: lynk_amount_from_payload($data);
$explicitClassIds = lynk_find_explicit_classes($pdo, $productCandidates, $config);
$explicitProductIds = lynk_find_explicit_products($pdo, $productCandidates);
$classIds = [];
$productIds = [];

if ($explicitClassIds && !$explicitProductIds) {
    $classIds = $explicitClassIds;
} elseif ($explicitProductIds) {
    $productIds = $explicitProductIds;
} else {
    $matchedProductIds = lynk_find_products($pdo, $productCandidates);
    $matchedClassIds = lynk_find_classes($pdo, $payload, $productCandidates, $config);

    if ($matchedProductIds) {
        $productIds = $matchedProductIds;
    } else {
        $classIds = $matchedClassIds;
    }
}

if ($orderId === '') {
    $orderId = $eventId ?: hash('sha256', $rawBody);
}

if (!lynk_is_paid_event($payload)) {
    send_json(200, [
        'ok' => true,
        'ignored' => true,
        'message' => 'Webhook diterima, tetapi status pembayaran belum sukses.',
    ]);
}

$existingOrder = $pdo->prepare('SELECT * FROM lynk_orders WHERE order_id = ? LIMIT 1');
$existingOrder->execute([$orderId]);
$savedOrder = $existingOrder->fetch();
$reprocessSavedOrderAsClass = false;

if ($savedOrder) {
    $savedStatus = clean_text($savedOrder['status'] ?? '', 40);
    $reprocessSavedOrderAsClass = $classIds && $savedStatus !== 'processed';

    if (!$reprocessSavedOrderAsClass) {
        $savedEmail = clean_email($savedOrder['buyer_email'] ?? '');
        $password = !empty($savedOrder['password_created']) && $savedEmail
            ? lynk_generated_password($savedEmail, $secret)
            : null;
        $retryResult = lynk_retry_saved_class_email($pdo, $savedOrder, $config, $secret);

        send_json(200, [
            'ok' => true,
            'duplicate' => true,
            'message' => 'Order Lynk.id sudah pernah diproses.',
            'emailRetried' => !empty($retryResult['attempted']),
            'emailSent' => !empty($retryResult['sent']),
            'emailError' => !empty($retryResult['sent']) ? '' : ($retryResult['message'] ?? ''),
            'account' => [
                'name' => $savedOrder['buyer_name'],
                'email' => $savedOrder['buyer_email'],
                'username' => $savedOrder['username'],
                'password' => $password,
                'loginUrl' => lynk_login_url($config),
            ],
        ]);
    }
}

if ($buyerEmail === '') {
    send_json(422, ['message' => 'Email pembeli tidak ditemukan pada payload Lynk.id.']);
}

if (!$classIds && !$productIds) {
    $insertOrder = $pdo->prepare(
        'INSERT INTO lynk_orders
        (id, event_id, order_id, buyer_name, buyer_email, product_key, product_name, class_ids, status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insertOrder->execute([
        make_id('lynk'),
        $eventId,
        $orderId,
        $buyerName ?: 'Pembeli Lynk.id',
        $buyerEmail,
        $productKey,
        $productDisplayName ?: $productKey,
        json_encode([], JSON_UNESCAPED_UNICODE),
        'unmapped',
        $rawBody,
    ]);

    send_json(200, [
        'ok' => true,
        'ignored' => true,
        'status' => 'unmapped',
        'message' => 'Produk Lynk.id tidak dipetakan ke kelas website, jadi tidak dibuatkan akun member.',
        'productCandidates' => $productCandidates,
    ]);
}

$productAccessResults = [];
$productEmailResults = [];
$productAccountEmailResults = [];
$firstProductAccountResult = null;

foreach ($productIds as $productId) {
    try {
        $accountResult = commerce_grant_product_member_account($pdo, [
            'productId' => $productId,
            'buyerName' => $buyerName ?: 'Pembeli Lynk.id',
            'buyerEmail' => $buyerEmail,
            'buyerPhone' => $buyerPhone,
        ], $config);
        if (!empty($accountResult['enabled']) && $firstProductAccountResult === null) {
            $firstProductAccountResult = $accountResult;
        }
        $accessResult = commerce_grant_digital_product_access($pdo, [
            'productId' => $productId,
            'memberId' => $accountResult['member']['id'] ?? '',
            'buyerName' => $buyerName ?: 'Pembeli Lynk.id',
            'buyerEmail' => $buyerEmail,
            'source' => 'lynk',
            'orderId' => $orderId . '-' . $productId,
        ]);
        $productAccessResults[] = $accessResult;
        lynk_insert_product_payment_snapshot(
            $pdo,
            $accessResult['product'] ?? [],
            $accessResult['access'] ?? [],
            $orderId,
            $paidAmount,
        );

        $productEmailResults[] = send_digital_product_delivery_email([
            'buyerName' => $buyerName ?: 'Pembeli Lynk.id',
            'buyerEmail' => $buyerEmail,
            'productTitle' => $accessResult['product']['title'] ?? 'Produk digital',
            'productType' => clean_text($accessResult['product']['product_type'] ?? 'digital', 40),
            'downloadUrl' => clean_asset_url(
                ($accessResult['product']['file_url'] ?? '')
                    ?: commerce_public_product_access_url(
                        $accessResult['access']['order_id'] ?? ($orderId . '-' . $productId),
                        clean_text($accessResult['product']['product_type'] ?? 'digital', 40)
                    ),
                1000
            ),
            'deliveryNote' => $accessResult['product']['delivery_note'] ?? '',
        ]);
        $accessUrl = clean_asset_url(
            ($accessResult['product']['file_url'] ?? '')
                ?: commerce_public_product_access_url(
                    $accessResult['access']['order_id'] ?? ($orderId . '-' . $productId),
                    clean_text($accessResult['product']['product_type'] ?? 'digital', 40)
                ),
            1000
        );
        $productAccountEmailResults[] = !empty($accountResult['enabled'])
            ? send_product_access_credentials_email([
                'buyerName' => $buyerName ?: 'Pembeli Lynk.id',
                'buyerEmail' => $buyerEmail,
                'username' => clean_text($accountResult['member']['username'] ?? '', 120),
                'password' => $accountResult['password'],
                'productTitle' => clean_text($accessResult['product']['title'] ?? 'Produk digital', 180),
                'loginUrl' => $accountResult['loginUrl'],
                'accessUrl' => $accessUrl,
            ])
            : ['sent' => false, 'message' => 'Akun otomatis produk tidak aktif.'];
    } catch (Throwable $error) {
        // Continue with other mapped products/classes.
    }
}

if (!$classIds) {
    $firstProduct = $productAccessResults[0]['product'] ?? [];
    $productEmailSent = false;
    $productEmailError = '';

    foreach ($productEmailResults as $emailResult) {
        if (!empty($emailResult['sent'])) {
            $productEmailSent = true;
            break;
        }

        if ($productEmailError === '' && !empty($emailResult['message'])) {
            $productEmailError = clean_text($emailResult['message'], 240);
        }
    }

    $insertOrder = $pdo->prepare(
        'INSERT INTO lynk_orders
        (id, event_id, order_id, buyer_name, buyer_email, product_key, product_name, class_ids, member_id, username, password_created, email_sent, email_error, email_sent_at, status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insertOrder->execute([
        make_id('lynk'),
        $eventId,
        $orderId,
        $buyerName ?: 'Pembeli Lynk.id',
        $buyerEmail,
        $productKey,
        clean_text($firstProduct['title'] ?? ($productDisplayName ?: ($productKey ?: 'Produk digital')), 240),
        json_encode([], JSON_UNESCAPED_UNICODE),
        $firstProductAccountResult['member']['id'] ?? '',
        $firstProductAccountResult['member']['username'] ?? '',
        !empty($firstProductAccountResult['passwordCreated']) ? 1 : 0,
        $productEmailSent ? 1 : 0,
        $productEmailSent ? '' : $productEmailError,
        $productEmailSent ? date('Y-m-d H:i:s') : null,
        'product_processed',
        $rawBody,
    ]);

    send_json(200, [
        'ok' => true,
        'message' => 'Akses produk digital berhasil dibuat dari pembayaran Lynk.id.',
        'mappedAs' => 'digital_product',
        'productIds' => $productIds,
        'emailResults' => $productEmailResults,
        'accountEmailResults' => $productAccountEmailResults,
    ]);
}

$memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE role = ? AND email = ? LIMIT 1');
$memberQuery->execute(['member', $buyerEmail]);
$member = $memberQuery->fetch();
$password = lynk_generated_password($buyerEmail, $secret);
$passwordCreated = false;
$newAccessIds = [];

if ($member) {
    $currentClassIds = clean_allowed_class_ids($member['allowed_class_ids'] ?? null);
    $currentClassIds = is_array($currentClassIds) ? $currentClassIds : [];
    $mergedClassIds = array_values(array_unique(array_merge($currentClassIds, $classIds)));
    $newAccessIds = array_values(array_diff($mergedClassIds, $currentClassIds));
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
        $buyerName ?: $member['name'],
        $buyerPhone ?: ($member['phone'] ?? ''),
        'Aktif',
        json_encode($mergedClassIds, JSON_UNESCAPED_UNICODE),
        $passwordHash,
        $member['id'],
        'member',
    ]);
} else {
    $member = [
        'id' => make_id('member'),
        'username' => lynk_unique_username($pdo, $buyerEmail, $buyerName),
    ];
    $newAccessIds = $classIds;
    $passwordCreated = true;
    $insert = $pdo->prepare(
        'INSERT INTO accounts
        (id, role, name, username, email, phone, status, avatar, allowed_class_ids, password_hash, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insert->execute([
        $member['id'],
        'member',
        $buyerName ?: 'Pembeli Lynk.id',
        $member['username'],
        $buyerEmail,
        $buyerPhone,
        'Aktif',
        '',
        json_encode($classIds, JSON_UNESCAPED_UNICODE),
        hash_password_value($password),
        date('Y-m-d'),
    ]);
}

if ($newAccessIds) {
    $updateStudents = $pdo->prepare('UPDATE classes SET students = students + 1 WHERE id = ?');

    foreach ($newAccessIds as $classId) {
        $updateStudents->execute([$classId]);
    }
}

if ($reprocessSavedOrderAsClass) {
    $updateOrder = $pdo->prepare(
        'UPDATE lynk_orders
        SET event_id = ?, buyer_name = ?, buyer_email = ?, product_key = ?, product_name = ?, class_ids = ?,
            member_id = ?, username = ?, password_created = ?, status = ?, payload = ?,
            email_sent = 0, email_error = ?, email_sent_at = NULL
        WHERE order_id = ?',
    );
    $updateOrder->execute([
        $eventId,
        $buyerName ?: 'Pembeli Lynk.id',
        $buyerEmail,
        $productKey,
        $productDisplayName ?: $productKey,
        json_encode($classIds, JSON_UNESCAPED_UNICODE),
        $member['id'],
        $member['username'],
        $passwordCreated ? 1 : 0,
        'processed',
        $rawBody,
        '',
        $orderId,
    ]);
} else {
    $insertOrder = $pdo->prepare(
        'INSERT INTO lynk_orders
        (id, event_id, order_id, buyer_name, buyer_email, product_key, product_name, class_ids, member_id, username, password_created, status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insertOrder->execute([
        make_id('lynk'),
        $eventId,
        $orderId,
        $buyerName ?: 'Pembeli Lynk.id',
        $buyerEmail,
        $productKey,
        $productDisplayName ?: $productKey,
        json_encode($classIds, JSON_UNESCAPED_UNICODE),
        $member['id'],
        $member['username'],
        $passwordCreated ? 1 : 0,
        'processed',
        $rawBody,
    ]);
}

$account = [
    'name' => $buyerName ?: 'Pembeli Lynk.id',
    'email' => $buyerEmail,
    'username' => $member['username'],
    'password' => $passwordCreated ? $password : null,
    'loginUrl' => lynk_login_url($config),
    'classIds' => $classIds,
    'purchaseMessages' => lynk_fetch_class_purchase_messages($pdo, $classIds),
];
$emailResult = lynk_send_credentials_email(
    $buyerEmail,
    $buyerName ?: 'Pembeli Lynk.id',
    $account,
    $config,
);
lynk_store_email_result($pdo, $orderId, $emailResult);

send_json(200, [
    'ok' => true,
    'message' => 'Akun member berhasil dibuat atau diperbarui dari pembayaran Lynk.id.',
    'mappedAs' => 'class',
    'reprocessed' => $reprocessSavedOrderAsClass,
    'emailSent' => !empty($emailResult['sent']),
    'emailError' => !empty($emailResult['sent']) ? '' : ($emailResult['message'] ?? 'Email Resend gagal dikirim.'),
    'productEmailResults' => $productEmailResults,
    'productAccountEmailResults' => $productAccountEmailResults,
    'fulfillmentMessage' => sprintf(
        "Akses kelas aktif.\nLogin: %s\nUsername: %s%s",
        $account['loginUrl'],
        $account['username'],
        $account['password'] ? "\nPassword: {$account['password']}" : "\nGunakan password akun yang sudah pernah dibuat."
    ),
    'account' => $account,
]);
