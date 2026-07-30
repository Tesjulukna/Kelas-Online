<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_paypal.php';

ensure_method(['GET']);

function paypal_return_error(string $message, string $backUrl = '/'): void
{
    http_response_code(400);
    header('Content-Type: text/html; charset=utf-8');
    $safeMessage = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $safeBackUrl = htmlspecialchars($backUrl, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Pembayaran PayPal</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;padding:20px;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033}'
        . 'main{width:min(520px,100%);box-sizing:border-box;padding:28px;border:1px solid #dbe3ef;border-radius:18px;background:#fff;box-shadow:0 18px 50px #0f172a14}'
        . 'h1{margin:0 0 10px;font-size:22px}p{color:#64748b;line-height:1.6}a{display:inline-flex;margin-top:12px;padding:11px 16px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700}</style></head>'
        . '<body><main><h1>Pembayaran belum selesai</h1><p>' . $safeMessage . '</p><a href="' . $safeBackUrl . '">Kembali ke website</a></main></body></html>';
    exit;
}

$pdo = db();
$config = api_config();
$paypalOrderId = clean_text($_GET['token'] ?? '', 180);

if ($paypalOrderId === '') {
    paypal_return_error('Order ID PayPal tidak ditemukan pada URL kembali.');
}

paypal_assert_config($config, false, false);
paypal_ensure_schema($pdo);

$orderQuery = $pdo->prepare('SELECT * FROM paypal_orders WHERE paypal_order_id = ? LIMIT 1');
$orderQuery->execute([$paypalOrderId]);
$order = $orderQuery->fetch();

if (!$order) {
    paypal_return_error('Order PayPal tidak ditemukan di website.');
}

$orderPayload = paypal_order_payload($order);

if (strtolower(clean_text($order['status'] ?? '', 40)) === 'processed') {
    $redirectUrl = paypal_success_url($order, $orderPayload, $config) ?: '/';
    header('Location: ' . $redirectUrl, true, 302);
    exit;
}

$markApproved = $pdo->prepare('UPDATE paypal_orders SET status = ? WHERE id = ? AND status <> ?');
$markApproved->execute(['approved', $order['id'], 'processed']);
$captureResult = paypal_capture_order($config, $paypalOrderId, $order['merchant_ref'] . '-capture');

if (empty($captureResult['ok'])) {
    $freshQuery = $pdo->prepare('SELECT * FROM paypal_orders WHERE id = ? LIMIT 1');
    $freshQuery->execute([$order['id']]);
    $freshOrder = $freshQuery->fetch() ?: $order;

    if (strtolower(clean_text($freshOrder['status'] ?? '', 40)) === 'processed') {
        $redirectUrl = paypal_success_url($freshOrder, paypal_order_payload($freshOrder), $config) ?: '/';
        header('Location: ' . $redirectUrl, true, 302);
        exit;
    }

    $detailsResult = paypal_api_request(
        $config,
        'GET',
        '/v2/checkout/orders/' . rawurlencode($paypalOrderId),
    );
    $captureData = !empty($detailsResult['ok'])
        ? paypal_capture_from_response($detailsResult['data'])
        : [];

    if (!$captureData) {
        paypal_return_error(
            paypal_api_error_message($captureResult, 'Capture pembayaran PayPal belum berhasil. Silakan periksa akun PayPal Anda.'),
            clean_external_url($config['paypal_cancel_url'] ?? '') ?: '/',
        );
    }
} else {
    $captureData = paypal_capture_from_response($captureResult['data']);
}

if (!$captureData) {
    paypal_return_error('PayPal belum mengembalikan data capture pembayaran.');
}

try {
    $fulfillment = paypal_fulfill_order($pdo, $config, $order, $captureData);
} catch (Throwable $error) {
    paypal_return_error('Pembayaran diterima, tetapi aktivasi akses masih diproses. Silakan cek email atau hubungi admin.');
}

$redirectUrl = clean_asset_url($fulfillment['redirectUrl'] ?? '', 1200)
    ?: paypal_success_url($order, $orderPayload, $config)
    ?: '/';
header('Location: ' . $redirectUrl, true, 302);
exit;
