<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_digital-products-common.php';

ensure_method(['GET']);

$pdo = db();
$orderCode = clean_text($_GET['order'] ?? ($_GET['ref'] ?? ($_GET['merchant_ref'] ?? '')), 180);

if ($orderCode === '') {
    send_json(400, ['message' => 'Kode akses produk tidak ditemukan.']);
}

$orderQuery = $pdo->prepare('SELECT * FROM tripay_orders WHERE merchant_ref = ? OR reference = ? LIMIT 1');
$orderQuery->execute([$orderCode, $orderCode]);
$order = $orderQuery->fetch();

if ($order) {
    $payload = commerce_json($order['payload'] ?? '{}');

    if (clean_text($payload['order_type'] ?? '', 60) !== 'digital_product') {
        send_json(404, ['message' => 'Order ini bukan produk digital.']);
    }

    $status = strtolower(clean_text($order['status'] ?? 'pending', 40));
    $paid = !empty($order['access_granted']) || in_array($status, ['processed', 'paid', 'success', 'settlement', 'capture'], true);
    $productId = clean_text($payload['product_id'] ?? '', 120);
    $product = $productId !== '' ? commerce_fetch_product($pdo, $productId, false) : null;
    $productRow = $product ?: [];
    $productPublic = $product ? digital_product_public($product) : [
        'id' => $productId,
        'productType' => clean_text($payload['product_type'] ?? 'digital', 40) === 'prompt' ? 'prompt' : 'digital',
        'title' => clean_text($payload['product_title'] ?? $order['class_title'] ?? 'Produk digital', 180),
        'description' => '',
        'thumbnail' => '',
        'fileUrl' => clean_asset_url($payload['delivery_url'] ?? '', 1000),
        'fileName' => '',
        'deliveryNote' => clean_text($payload['delivery_note'] ?? '', 1200),
    ];

    send_json(200, [
        'ok' => true,
        'paid' => $paid,
        'status' => $status,
        'checkoutUrl' => clean_asset_url($order['checkout_url'] ?? '', 1000),
        'orderCode' => $order['reference'] ?: $order['merchant_ref'],
        'buyerName' => clean_text($order['buyer_name'] ?? '', 160),
        'product' => $productPublic,
        'delivery' => $paid ? [
            'downloadUrl' => clean_asset_url($productRow['file_url'] ?? ($payload['delivery_url'] ?? ''), 1000),
            'deliveryNote' => clean_text($productRow['delivery_note'] ?? ($payload['delivery_note'] ?? ''), 1200),
            'deliveryNoteEn' => clean_text($productRow['delivery_note_en'] ?? '', 1200),
            'customMessage' => clean_text(!empty($productRow['custom_message_enabled']) ? ($productRow['custom_message'] ?? '') : ($payload['custom_message'] ?? ''), 1200),
            'promptContent' => clean_text($productRow['prompt_content'] ?? '', 40000),
            'promptItems' => digital_prompt_items_public($productRow['prompt_items'] ?? '[]', $productRow['prompt_content'] ?? ''),
            'promptInstructions' => clean_text($productRow['prompt_instructions'] ?? '', 4000),
            'promptExamples' => clean_text($productRow['prompt_examples'] ?? '', 8000),
        ] : null,
        'message' => $paid
            ? (($productRow['product_type'] ?? '') === 'prompt' ? 'Pembayaran berhasil. Prompt sudah bisa diakses.' : 'Pembayaran berhasil. Produk digital sudah bisa diakses.')
            : 'Pembayaran belum terkonfirmasi. Jika sudah bayar, tunggu callback Tripay beberapa saat lalu cek ulang.',
    ]);
}

$accessQuery = $pdo->prepare('SELECT * FROM digital_product_access WHERE order_id = ? AND status = ? LIMIT 1');
$accessQuery->execute([$orderCode, 'active']);
$access = $accessQuery->fetch();

if (!$access) {
    send_json(404, ['message' => 'Akses produk belum ditemukan.']);
}

$product = commerce_fetch_product($pdo, $access['product_id'], false);
$productRow = $product ?: [];

send_json(200, [
    'ok' => true,
    'paid' => true,
    'status' => 'processed',
    'checkoutUrl' => '',
    'orderCode' => $orderCode,
    'buyerName' => clean_text($access['buyer_name'] ?? '', 160),
    'product' => $product ? digital_product_public($product) : [
        'id' => clean_text($access['product_id'] ?? '', 120),
        'title' => clean_text($access['product_title'] ?? 'Produk digital', 180),
        'description' => '',
        'thumbnail' => '',
        'fileUrl' => clean_asset_url($access['download_url'] ?? '', 1000),
        'fileName' => '',
    ],
    'delivery' => [
        'downloadUrl' => clean_asset_url($productRow['file_url'] ?? ($access['download_url'] ?? ''), 1000),
        'deliveryNote' => clean_text($productRow['delivery_note'] ?? '', 1200),
        'deliveryNoteEn' => clean_text($productRow['delivery_note_en'] ?? '', 1200),
        'customMessage' => clean_text(!empty($productRow['custom_message_enabled']) ? ($productRow['custom_message'] ?? '') : '', 1200),
        'promptContent' => clean_text($productRow['prompt_content'] ?? '', 40000),
        'promptItems' => digital_prompt_items_public($productRow['prompt_items'] ?? '[]', $productRow['prompt_content'] ?? ''),
        'promptInstructions' => clean_text($productRow['prompt_instructions'] ?? '', 4000),
        'promptExamples' => clean_text($productRow['prompt_examples'] ?? '', 8000),
    ],
    'message' => (($productRow['product_type'] ?? '') === 'prompt' ? 'Prompt sudah bisa diakses.' : 'Produk digital sudah bisa diakses.'),
]);
