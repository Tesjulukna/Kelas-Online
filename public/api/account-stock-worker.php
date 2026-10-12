<?php

// Run with hosting cron: php /home/USER/public_html/api/account-stock-worker.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_account-stock.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
$pdo = db();
account_stock_ensure_schema($pdo);
$products = $pdo->query("SELECT id FROM digital_products WHERE product_type = 'account'")->fetchAll(PDO::FETCH_COLUMN);
foreach ($products as $productId) commerce_fetch_product($pdo, $productId, false);
$query = $pdo->query("SELECT order_id FROM product_account_stock WHERE status = 'sold' AND order_id IS NOT NULL AND (sheet_synced = 0 OR email_status <> 'sent') ORDER BY last_attempt_at ASC, id ASC LIMIT 50");
foreach ($query->fetchAll(PDO::FETCH_COLUMN) as $orderId) {
    try { account_stock_dispatch($pdo, $orderId); } catch (Throwable $error) { /* Retry next cron run, without logging credentials. */ }
}
