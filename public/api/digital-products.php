<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_digital-products-common.php';

ensure_method(['GET', 'PUT']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

ensure_digital_products_schema($pdo);

if ($method === 'GET') {
    send_json(200, fetch_digital_products($pdo, current_user()));
}

require_user('admin');
$payload = read_json_body();
$products = is_array($payload['digitalProducts'] ?? null) ? $payload['digitalProducts'] : [];

$insert = $pdo->prepare(
    'INSERT INTO digital_products
    (id, product_type, title, description, price, display_sales, rating, status, thumbnail, add_video, video_url, file_url, file_name, delivery_note, platform_type, pay_what_you_want, sale_price, item_quantity_enabled, item_quantity, limit_qty_per_checkout, allow_repeat_purchase, purchase_button_label, release_time_enabled, release_time, whatsapp_notification, custom_message_enabled, custom_message, reviews, add_ons, customer_questions, block_layout, require_customer_name, require_customer_phone, auto_create_member, lynk_product_key, tripay_product_key, show_on_homepage, show_on_member, highlighted, prompt_content, prompt_items, prompt_preview, prompt_instructions, prompt_examples, prompt_license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
);

try {
    $pdo->beginTransaction();
    $pdo->exec('DELETE FROM digital_products');

    foreach (array_slice($products, 0, 300) as $index => $product) {
        if (!is_array($product)) {
            continue;
        }

        $id = clean_text($product['id'] ?? make_id('product'), 120) ?: make_id('product');
        $productType = clean_text($product['productType'] ?? 'digital', 40) === 'prompt' ? 'prompt' : 'digital';
        $promptItems = $productType === 'prompt'
            ? digital_prompt_items_public($product['promptItems'] ?? [], clean_text($product['promptContent'] ?? '', 40000))
            : [];
        $promptContent = clean_text($product['promptContent'] ?? '', 40000);

        if ($productType === 'prompt' && $promptItems) {
            $promptTextBlocks = [];

            foreach ($promptItems as $promptItem) {
                $promptTextBlocks[] = trim(($promptItem['title'] ?? 'Prompt') . "\n" . ($promptItem['prompt'] ?? ''));
            }

            $promptContent = implode("\n\n", $promptTextBlocks);
        }

        $insert->execute([
            $id,
            $productType,
            clean_text($product['title'] ?? 'Produk Digital ' . ($index + 1), 180),
            clean_rich_html($product['description'] ?? '', 20000),
            clean_number($product['price'] ?? 0, 0, 1000000000),
            isset($product['displaySales']) && $product['displaySales'] !== '' ? clean_number($product['displaySales'], 0, 10000000) : null,
            isset($product['rating']) && $product['rating'] !== '' ? min(5, max(0, (float) $product['rating'])) : null,
            clean_text($product['status'] ?? 'Draft', 40),
            clean_asset_url($product['thumbnail'] ?? ''),
            !empty($product['addVideo']) ? 1 : 0,
            clean_external_url($product['videoUrl'] ?? ''),
            clean_asset_url($product['fileUrl'] ?? ''),
            clean_text($product['fileName'] ?? '', 220),
            clean_text($product['deliveryNote'] ?? '', 1200),
            clean_text($product['platformType'] ?? 'upload', 60),
            !empty($product['payWhatYouWant']) ? 1 : 0,
            clean_number($product['salePrice'] ?? 0, 0, 1000000000),
            !empty($product['itemQuantityEnabled']) ? 1 : 0,
            clean_number($product['itemQuantity'] ?? 0, 0, 10000000),
            !empty($product['limitQtyPerCheckout']) ? 1 : 0,
            !empty($product['allowRepeatPurchase']) ? 1 : 0,
            clean_text($product['purchaseButtonLabel'] ?? 'Buy Now', 80),
            !empty($product['releaseTimeEnabled']) ? 1 : 0,
            clean_text($product['releaseTime'] ?? '', 120),
            !empty($product['whatsappNotification']) ? 1 : 0,
            !empty($product['customMessageEnabled']) ? 1 : 0,
            clean_text($product['customMessage'] ?? '', 1200),
            json_encode(is_array($product['reviews'] ?? null) ? $product['reviews'] : [], JSON_UNESCAPED_UNICODE),
            json_encode(is_array($product['addOns'] ?? null) ? $product['addOns'] : [], JSON_UNESCAPED_UNICODE),
            json_encode(is_array($product['customerQuestions'] ?? null) ? $product['customerQuestions'] : [], JSON_UNESCAPED_UNICODE),
            clean_text($product['blockLayout'] ?? 'default', 40),
            !empty($product['requireCustomerName']) ? 1 : 0,
            !empty($product['requireCustomerPhone']) ? 1 : 0,
            !empty($product['autoCreateMember']) ? 1 : 0,
            clean_text($product['lynkProductKey'] ?? '', 180),
            clean_text($product['tripayProductKey'] ?? '', 180),
            array_key_exists('showOnHomepage', $product) && empty($product['showOnHomepage']) ? 0 : 1,
            array_key_exists('showOnMember', $product) && empty($product['showOnMember']) ? 0 : 1,
            !empty($product['highlighted']) ? 1 : 0,
            $promptContent,
            json_encode($promptItems, JSON_UNESCAPED_UNICODE),
            clean_text($product['promptPreview'] ?? '', 2000),
            clean_text($product['promptInstructions'] ?? '', 4000),
            clean_text($product['promptExamples'] ?? '', 8000),
            clean_text($product['promptLicense'] ?? 'Personal & commercial use', 120),
        ]);
    }

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    send_json(500, ['message' => 'Produk digital tidak bisa disimpan.']);
}

send_json(200, fetch_digital_products($pdo, current_user()));
