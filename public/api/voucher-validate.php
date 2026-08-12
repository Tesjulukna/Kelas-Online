<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_vouchers.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$code = voucher_clean_code($payload['voucherCode'] ?? $payload['code'] ?? '');

try {
    $context = voucher_context_from_request($pdo, $payload, current_user());
    $calculation = voucher_calculate($pdo, $code, $context, true);
    send_json(200, [
        'ok' => true,
        'valid' => true,
        'voucher' => voucher_snapshot($calculation),
        'subtotal' => (int) $calculation['subtotal'],
        'discountAmount' => (int) $calculation['discountAmount'],
        'finalAmount' => (int) $calculation['finalAmount'],
        'pricing' => [
            'originalSubtotal' => (int) ($context['originalSubtotal'] ?? $context['subtotal'] ?? 0),
            'subtotalAfterSaleOrBundle' => (int) $calculation['subtotal'],
            'voucherDiscount' => (int) $calculation['discountAmount'],
            'finalAmount' => (int) $calculation['finalAmount'],
        ],
        'message' => 'Voucher berhasil diterapkan.',
    ]);
} catch (VoucherException $error) {
    send_json($error->apiStatus(), [
        'ok' => false,
        'valid' => false,
        'code' => $error->errorCode(),
        'message' => $error->getMessage(),
    ]);
}
