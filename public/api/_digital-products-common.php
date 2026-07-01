<?php

declare(strict_types=1);

function digital_json($value): array
{
    if (is_array($value)) {
        return $value;
    }

    $decoded = json_decode((string) ($value ?? '[]'), true);

    return is_array($decoded) ? $decoded : [];
}

function ensure_digital_product_column(PDO $pdo, string $column, string $definition): void
{
    $query = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    );
    $query->execute(['digital_products', $column]);

    if ((int) $query->fetchColumn() === 0) {
        $pdo->exec('ALTER TABLE digital_products ADD ' . $column . ' ' . $definition);
    }
}

function ensure_digital_products_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS digital_products (
            id VARCHAR(120) PRIMARY KEY,
            title VARCHAR(180) NOT NULL,
            description LONGTEXT,
            price INT NOT NULL DEFAULT 0,
            display_sales INT NULL,
            rating DECIMAL(2,1) NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'Draft',
            thumbnail MEDIUMTEXT,
            reviews LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );

    ensure_digital_product_column($pdo, 'display_sales', 'INT NULL');
    ensure_digital_product_column($pdo, 'rating', 'DECIMAL(2,1) NULL');
    ensure_digital_product_column($pdo, 'add_video', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'video_url', 'TEXT NULL');
    ensure_digital_product_column($pdo, 'file_url', 'MEDIUMTEXT NULL');
    ensure_digital_product_column($pdo, 'file_name', "VARCHAR(220) NOT NULL DEFAULT ''");
    ensure_digital_product_column($pdo, 'delivery_note', 'LONGTEXT NULL');
    ensure_digital_product_column($pdo, 'platform_type', "VARCHAR(60) NOT NULL DEFAULT 'upload'");
    ensure_digital_product_column($pdo, 'pay_what_you_want', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'sale_price', 'INT NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'item_quantity_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'item_quantity', 'INT NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'limit_qty_per_checkout', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'purchase_button_label', "VARCHAR(80) NOT NULL DEFAULT 'Buy Now'");
    ensure_digital_product_column($pdo, 'release_time_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'release_time', "VARCHAR(120) NOT NULL DEFAULT ''");
    ensure_digital_product_column($pdo, 'whatsapp_notification', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'custom_message_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'custom_message', 'LONGTEXT NULL');
    ensure_digital_product_column($pdo, 'reviews', 'LONGTEXT NULL');
    ensure_digital_product_column($pdo, 'add_ons', 'LONGTEXT NULL');
    ensure_digital_product_column($pdo, 'customer_questions', 'LONGTEXT NULL');
    ensure_digital_product_column($pdo, 'block_layout', "VARCHAR(40) NOT NULL DEFAULT 'default'");
    ensure_digital_product_column($pdo, 'require_customer_name', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'require_customer_phone', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'auto_create_member', 'TINYINT(1) NOT NULL DEFAULT 0');
    ensure_digital_product_column($pdo, 'lynk_product_key', "VARCHAR(180) NOT NULL DEFAULT ''");
    ensure_digital_product_column($pdo, 'tripay_product_key', "VARCHAR(180) NOT NULL DEFAULT ''");
    ensure_digital_product_column($pdo, 'show_on_homepage', 'TINYINT(1) NOT NULL DEFAULT 1');
    ensure_digital_product_column($pdo, 'show_on_member', 'TINYINT(1) NOT NULL DEFAULT 1');
    ensure_digital_product_column($pdo, 'highlighted', 'TINYINT(1) NOT NULL DEFAULT 0');
}

function digital_product_public(array $row): array
{
    return [
        'id' => $row['id'],
        'title' => $row['title'],
        'description' => $row['description'] ?? '',
        'price' => (int) ($row['price'] ?? 0),
        'displaySales' => $row['display_sales'] ?? '',
        'accessCount' => (int) ($row['access_count'] ?? 0),
        'rating' => $row['rating'] ?? '',
        'status' => $row['status'] ?? 'Draft',
        'thumbnail' => $row['thumbnail'] ?? '',
        'addVideo' => !empty($row['add_video']),
        'videoUrl' => $row['video_url'] ?? '',
        'fileUrl' => $row['file_url'] ?? '',
        'fileName' => $row['file_name'] ?? '',
        'deliveryNote' => $row['delivery_note'] ?? '',
        'platformType' => $row['platform_type'] ?? 'upload',
        'payWhatYouWant' => !empty($row['pay_what_you_want']),
        'salePrice' => (int) ($row['sale_price'] ?? 0),
        'itemQuantityEnabled' => !empty($row['item_quantity_enabled']),
        'itemQuantity' => (int) ($row['item_quantity'] ?? 0),
        'limitQtyPerCheckout' => !empty($row['limit_qty_per_checkout']),
        'purchaseButtonLabel' => $row['purchase_button_label'] ?? 'Buy Now',
        'releaseTimeEnabled' => !empty($row['release_time_enabled']),
        'releaseTime' => $row['release_time'] ?? '',
        'whatsappNotification' => !empty($row['whatsapp_notification']),
        'customMessageEnabled' => !empty($row['custom_message_enabled']),
        'customMessage' => $row['custom_message'] ?? '',
        'reviews' => digital_json($row['reviews'] ?? '[]'),
        'addOns' => digital_json($row['add_ons'] ?? '[]'),
        'customerQuestions' => digital_json($row['customer_questions'] ?? '[]'),
        'blockLayout' => $row['block_layout'] ?? 'default',
        'requireCustomerName' => !empty($row['require_customer_name']),
        'requireCustomerPhone' => !empty($row['require_customer_phone']),
        'autoCreateMember' => in_array(strtolower(trim((string) ($row['auto_create_member'] ?? '0'))), ['1', 'true', 'yes', 'on'], true),
        'lynkProductKey' => $row['lynk_product_key'] ?? '',
        'tripayProductKey' => $row['tripay_product_key'] ?? '',
        'showOnHomepage' => array_key_exists('show_on_homepage', $row) ? (bool) $row['show_on_homepage'] : true,
        'showOnMember' => array_key_exists('show_on_member', $row) ? (bool) $row['show_on_member'] : true,
        'highlighted' => !empty($row['highlighted']),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function digital_access_public(array $row): array
{
    return [
        'id' => $row['id'],
        'productId' => $row['product_id'] ?? '',
        'productTitle' => $row['product_title'] ?? '',
        'memberId' => $row['member_id'] ?? '',
        'buyerName' => $row['buyer_name'] ?? '',
        'buyerEmail' => $row['buyer_email'] ?? '',
        'source' => $row['source'] ?? '',
        'orderId' => $row['order_id'] ?? '',
        'status' => $row['status'] ?? 'active',
        'downloadUrl' => $row['download_url'] ?? '',
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}

function fetch_digital_products(PDO $pdo, ?array $user): array
{
    $isAdmin = ($user['role'] ?? '') === 'admin';
    $selectProducts = "
        SELECT p.*, (
            SELECT COUNT(*)
            FROM digital_product_access dpa
            WHERE dpa.product_id = p.id
              AND dpa.status = 'active'
        ) AS access_count
        FROM digital_products p
    ";
    $query = $isAdmin
        ? $pdo->query($selectProducts . ' ORDER BY p.updated_at DESC, p.id ASC')
        : $pdo->query($selectProducts . " WHERE p.status = 'Aktif' ORDER BY p.updated_at DESC, p.id ASC");

    $products = array_map('digital_product_public', $query->fetchAll());
    $access = [];

    if ($isAdmin) {
        $accessQuery = $pdo->query('SELECT * FROM digital_product_access ORDER BY created_at DESC LIMIT 1000');
        $access = array_map('digital_access_public', $accessQuery->fetchAll());
    } elseif (($user['role'] ?? '') === 'member') {
        $accessQuery = $pdo->prepare(
            'SELECT * FROM digital_product_access WHERE member_id = ? ORDER BY created_at DESC LIMIT 200',
        );
        $accessQuery->execute([$user['userId'] ?? '']);
        $access = array_map('digital_access_public', $accessQuery->fetchAll());
    }

    return [
        'digitalProducts' => $products,
        'digitalProductAccess' => $access,
        'updatedAt' => updated_at($pdo),
    ];
}
