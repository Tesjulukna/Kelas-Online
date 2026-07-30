<?php

declare(strict_types=1);

function paypal_ensure_schema(PDO $pdo): void
{
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS paypal_orders (
                id VARCHAR(120) PRIMARY KEY,
                merchant_ref VARCHAR(180) NOT NULL DEFAULT '',
                paypal_order_id VARCHAR(180) NULL DEFAULT NULL,
                capture_id VARCHAR(180) NOT NULL DEFAULT '',
                member_id VARCHAR(120) NOT NULL DEFAULT '',
                buyer_name VARCHAR(160) NOT NULL DEFAULT '',
                buyer_email VARCHAR(180) NOT NULL DEFAULT '',
                buyer_phone VARCHAR(60) NOT NULL DEFAULT '',
                item_type VARCHAR(40) NOT NULL DEFAULT 'class',
                item_id VARCHAR(120) NOT NULL DEFAULT '',
                item_title VARCHAR(180) NOT NULL DEFAULT '',
                amount_idr INT NOT NULL DEFAULT 0,
                currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                currency_value DECIMAL(14,2) NOT NULL DEFAULT 0,
                exchange_rate DECIMAL(14,4) NOT NULL DEFAULT 0,
                status VARCHAR(40) NOT NULL DEFAULT 'created',
                approval_url MEDIUMTEXT,
                access_granted TINYINT(1) NOT NULL DEFAULT 0,
                payload MEDIUMTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY paypal_merchant_ref_unique (merchant_ref),
                UNIQUE KEY paypal_order_unique (paypal_order_id),
                INDEX paypal_capture_index (capture_id),
                INDEX paypal_member_index (member_id),
                INDEX paypal_item_index (item_type, item_id),
                INDEX paypal_status_index (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        );

        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS paypal_webhook_events (
                id VARCHAR(180) PRIMARY KEY,
                event_type VARCHAR(120) NOT NULL DEFAULT '',
                resource_id VARCHAR(180) NOT NULL DEFAULT '',
                status VARCHAR(40) NOT NULL DEFAULT 'received',
                payload MEDIUMTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME NULL,
                INDEX paypal_webhook_type_index (event_type),
                INDEX paypal_webhook_resource_index (resource_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        );
    } catch (Throwable $error) {
        // Hosting yang membatasi DDL tetap bisa berjalan jika tabel sudah dibuat lewat installer.
        $pdo->query('SELECT id FROM paypal_orders LIMIT 1');
        $pdo->query('SELECT id FROM paypal_webhook_events LIMIT 1');
    }
}

function paypal_config_value(array $config, string $key, int $maxLength = 500): string
{
    return clean_text($config[$key] ?? '', $maxLength);
}

function paypal_api_base_url(array $config): string
{
    return !empty($config['paypal_is_production'])
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
}

function paypal_origin(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = clean_text($_SERVER['HTTP_HOST'] ?? '', 180);

    return $host !== '' ? $scheme . '://' . $host : '';
}

function paypal_absolute_url(string $path): string
{
    $origin = paypal_origin();

    return $origin !== '' ? $origin . $path : '';
}

function paypal_assert_config(
    array $config,
    bool $requireWebhook = false,
    bool $requireExchangeRate = true
): void
{
    if (
        paypal_config_value($config, 'paypal_client_id') === ''
        || paypal_config_value($config, 'paypal_client_secret') === ''
    ) {
        send_json(500, ['message' => 'Client ID atau Client Secret PayPal belum diatur di environment hosting.']);
    }

    $currency = strtoupper(paypal_config_value($config, 'paypal_currency', 10) ?: 'USD');
    $exchangeRate = (float) ($config['paypal_idr_per_usd'] ?? 0);

    if ($currency !== 'USD') {
        send_json(500, ['message' => 'Integrasi PayPal saat ini harus menggunakan currency USD.']);
    }

    if ($requireExchangeRate && $exchangeRate <= 0) {
        send_json(500, ['message' => 'PAYPAL_IDR_PER_USD wajib diisi dengan kurs Rupiah per 1 USD.']);
    }

    if ($requireWebhook && paypal_config_value($config, 'paypal_webhook_id', 120) === '') {
        send_json(500, ['message' => 'PAYPAL_WEBHOOK_ID belum diatur di environment hosting.']);
    }
}

function paypal_access_token(array $config): string
{
    if (!function_exists('curl_init')) {
        send_json(500, ['message' => 'Ekstensi cURL PHP belum aktif untuk menghubungi PayPal.']);
    }

    $curl = curl_init(paypal_api_base_url($config) . '/v1/oauth2/token');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => 'grant_type=client_credentials',
        CURLOPT_USERPWD => paypal_config_value($config, 'paypal_client_id') . ':' . paypal_config_value($config, 'paypal_client_secret'),
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Accept-Language: en_US',
            'Content-Type: application/x-www-form-urlencoded',
            'User-Agent: ibnucreative-paypal-oauth',
        ],
        CURLOPT_TIMEOUT => 30,
    ]);

    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    $data = json_decode((string) $body, true);
    $data = is_array($data) ? $data : [];
    $token = clean_text($data['access_token'] ?? '', 2000);

    if ($body === false || $error !== '' || $status < 200 || $status >= 300 || $token === '') {
        send_json(502, [
            'message' => clean_text($data['error_description'] ?? $data['error'] ?? 'Autentikasi PayPal gagal.', 260),
        ]);
    }

    return $token;
}

function paypal_api_request(
    array $config,
    string $method,
    string $path,
    ?array $payload = null,
    string $requestId = ''
): array {
    $token = paypal_access_token($config);
    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
        'User-Agent: ibnucreative-paypal-checkout',
    ];

    if ($requestId !== '') {
        $headers[] = 'PayPal-Request-Id: ' . clean_text($requestId, 108);
    }

    $curl = curl_init(paypal_api_base_url($config) . $path);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 40,
    ];

    if ($payload !== null) {
        $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    $data = json_decode((string) $body, true);
    $data = is_array($data) ? $data : [];

    return [
        'ok' => $body !== false && $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'data' => $data,
        'error' => $error,
    ];
}

function paypal_api_error_message(array $result, string $fallback): string
{
    $data = is_array($result['data'] ?? null) ? $result['data'] : [];
    $details = is_array($data['details'] ?? null) ? $data['details'] : [];
    $detail = is_array($details[0] ?? null) ? $details[0] : [];

    return clean_text(
        $detail['description'] ?? $detail['issue'] ?? $data['message'] ?? $data['name'] ?? $fallback,
        300,
    );
}

function paypal_currency_value(int $amountIdr, float $idrPerUsd): string
{
    $value = ceil((max(0, $amountIdr) / max(0.0001, $idrPerUsd)) * 100) / 100;

    return number_format(max(0.01, $value), 2, '.', '');
}

function paypal_approval_url(array $data): string
{
    foreach (is_array($data['links'] ?? null) ? $data['links'] : [] as $link) {
        if (!is_array($link)) {
            continue;
        }

        $rel = strtolower(clean_text($link['rel'] ?? '', 40));

        if (in_array($rel, ['payer-action', 'approve'], true)) {
            return clean_external_url($link['href'] ?? '');
        }
    }

    return '';
}

function paypal_capture_from_response(array $data): array
{
    $purchaseUnits = is_array($data['purchase_units'] ?? null) ? $data['purchase_units'] : [];
    $payments = is_array($purchaseUnits[0]['payments'] ?? null) ? $purchaseUnits[0]['payments'] : [];
    $captures = is_array($payments['captures'] ?? null) ? $payments['captures'] : [];

    return is_array($captures[0] ?? null) ? $captures[0] : [];
}

function paypal_capture_order(array $config, string $orderId, string $requestId): array
{
    return paypal_api_request(
        $config,
        'POST',
        '/v2/checkout/orders/' . rawurlencode($orderId) . '/capture',
        [],
        $requestId,
    );
}

function paypal_verify_webhook(array $config, array $event): bool
{
    $verificationPayload = [
        'auth_algo' => clean_text($_SERVER['HTTP_PAYPAL_AUTH_ALGO'] ?? '', 120),
        'cert_url' => clean_external_url($_SERVER['HTTP_PAYPAL_CERT_URL'] ?? ''),
        'transmission_id' => clean_text($_SERVER['HTTP_PAYPAL_TRANSMISSION_ID'] ?? '', 120),
        'transmission_sig' => clean_text($_SERVER['HTTP_PAYPAL_TRANSMISSION_SIG'] ?? '', 1000),
        'transmission_time' => clean_text($_SERVER['HTTP_PAYPAL_TRANSMISSION_TIME'] ?? '', 120),
        'webhook_id' => paypal_config_value($config, 'paypal_webhook_id', 120),
        'webhook_event' => $event,
    ];

    foreach (['auth_algo', 'cert_url', 'transmission_id', 'transmission_sig', 'transmission_time', 'webhook_id'] as $key) {
        if ($verificationPayload[$key] === '') {
            return false;
        }
    }

    $result = paypal_api_request(
        $config,
        'POST',
        '/v1/notifications/verify-webhook-signature',
        $verificationPayload,
        '',
    );

    return !empty($result['ok'])
        && strtoupper(clean_text($result['data']['verification_status'] ?? '', 40)) === 'SUCCESS';
}

function paypal_order_payload(array $order): array
{
    $payload = json_decode((string) ($order['payload'] ?? '{}'), true);

    return is_array($payload) ? $payload : [];
}

function paypal_success_url(array $order, array $orderPayload, array $config): string
{
    if (($order['item_type'] ?? '') === 'digital_product') {
        return commerce_public_product_access_url(
            clean_text($order['merchant_ref'] ?? '', 180),
            clean_text($orderPayload['product_type'] ?? 'digital', 40),
        );
    }

    return commerce_login_url($config);
}

function paypal_fulfill_order(
    PDO $pdo,
    array $config,
    array $order,
    array $captureData,
    array $event = []
): array {
    $startedTransaction = !$pdo->inTransaction();

    if ($startedTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $lockedQuery = $pdo->prepare('SELECT * FROM paypal_orders WHERE id = ? FOR UPDATE');
        $lockedQuery->execute([$order['id']]);
        $lockedOrder = $lockedQuery->fetch();

        if (!$lockedOrder) {
            if ($startedTransaction && $pdo->inTransaction()) {
                $pdo->rollBack();
            }

            return ['ok' => false, 'message' => 'Order PayPal tidak ditemukan.'];
        }

        $orderPayload = paypal_order_payload($lockedOrder);
        $successUrl = paypal_success_url($lockedOrder, $orderPayload, $config);

        if (
            strtolower(clean_text($lockedOrder['status'] ?? '', 40)) === 'processed'
            || trim((string) ($lockedOrder['capture_id'] ?? '')) !== ''
        ) {
            if ($startedTransaction && $pdo->inTransaction()) {
                $pdo->commit();
            }

            return [
                'ok' => true,
                'duplicate' => true,
                'message' => 'Pembayaran PayPal sudah pernah diproses.',
                'redirectUrl' => $successUrl,
            ];
        }

        $captureStatus = strtoupper(clean_text($captureData['status'] ?? '', 40));
        $captureAmount = is_array($captureData['amount'] ?? null) ? $captureData['amount'] : [];
        $captureCurrency = strtoupper(clean_text($captureAmount['currency_code'] ?? '', 10));
        $captureValue = number_format((float) ($captureAmount['value'] ?? 0), 2, '.', '');
        $expectedValue = number_format((float) ($lockedOrder['currency_value'] ?? 0), 2, '.', '');
        $expectedCurrency = strtoupper(clean_text($lockedOrder['currency'] ?? 'USD', 10));

        if ($captureStatus !== 'COMPLETED') {
            throw new RuntimeException('Capture PayPal belum berstatus COMPLETED.');
        }

        if ($captureCurrency !== $expectedCurrency || $captureValue !== $expectedValue) {
            throw new RuntimeException('Nominal atau mata uang capture PayPal tidak sesuai dengan order.');
        }

        $captureId = clean_text($captureData['id'] ?? '', 180);

        if ($captureId === '') {
            throw new RuntimeException('Capture ID PayPal tidak tersedia.');
        }

        $existingCapture = $pdo->prepare('SELECT id FROM paypal_orders WHERE capture_id = ? AND id <> ? LIMIT 1');
        $existingCapture->execute([$captureId, $lockedOrder['id']]);

        if ($existingCapture->fetch()) {
            throw new RuntimeException('Capture PayPal sudah digunakan oleh order lain.');
        }

        $orderType = clean_text($orderPayload['order_type'] ?? ($lockedOrder['item_type'] ?? 'class'), 40);
        $buyerName = clean_text($lockedOrder['buyer_name'] ?? 'Pelanggan', 160);
        $buyerEmail = clean_email($lockedOrder['buyer_email'] ?? '');
        $buyerPhone = clean_phone($lockedOrder['buyer_phone'] ?? '');
        $memberId = clean_text($lockedOrder['member_id'] ?? '', 120);
        $accessGranted = false;
        $emailContext = [];

        if ($orderType === 'bundle') {
            $accountResult = commerce_find_or_create_member_account($pdo, [
                'memberId' => $memberId,
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
                'buyerPhone' => $buyerPhone,
            ], $config);
            $memberId = clean_text($accountResult['member']['id'] ?? $memberId, 120);
            $bundleItems = is_array($orderPayload['bundle_items'] ?? null) ? $orderPayload['bundle_items'] : [];
            $grantedCount = 0;

            foreach ($bundleItems as $bundleItem) {
                if (!is_array($bundleItem)) {
                    continue;
                }

                $itemType = clean_text($bundleItem['type'] ?? '', 40);
                $itemId = clean_text($bundleItem['id'] ?? '', 120);

                if ($itemId === '') {
                    continue;
                }

                if ($itemType === 'class') {
                    if (commerce_grant_member_class_access($pdo, $memberId, $itemId)) {
                        $grantedCount++;
                    }

                    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
                    $classQuery->execute([$itemId]);
                    $class = $classQuery->fetch() ?: [];
                    commerce_grant_class_bundled_products($pdo, [
                        'class' => $class,
                        'memberId' => $memberId,
                        'buyerName' => $buyerName,
                        'buyerEmail' => $buyerEmail,
                    ]);
                    continue;
                }

                if ($itemType === 'digital_product') {
                    $accessResult = commerce_grant_digital_product_access($pdo, [
                        'productId' => $itemId,
                        'memberId' => $memberId,
                        'buyerEmail' => $buyerEmail,
                        'buyerName' => $buyerName,
                        'source' => 'paypal-bundle',
                        'orderId' => $lockedOrder['merchant_ref'] . '-' . $itemId,
                    ]);

                    if (!empty($accessResult['granted'])) {
                        $grantedCount++;
                    }
                }
            }

            $accessGranted = $grantedCount > 0;
            $emailContext = [
                'type' => 'bundle',
                'accountResult' => $accountResult,
                'bundleItems' => $bundleItems,
            ];
        } elseif ($orderType === 'digital_product') {
            $productId = clean_text($orderPayload['product_id'] ?? ($lockedOrder['item_id'] ?? ''), 120);
            $accountResult = $memberId === ''
                ? commerce_grant_product_member_account($pdo, [
                    'productId' => $productId,
                    'buyerName' => $buyerName,
                    'buyerEmail' => $buyerEmail,
                    'buyerPhone' => $buyerPhone,
                ], $config)
                : [
                    'enabled' => false,
                    'member' => null,
                    'password' => null,
                    'loginUrl' => commerce_login_url($config),
                ];

            if ($memberId !== '' && empty($accountResult['member'])) {
                $memberQuery = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
                $memberQuery->execute([$memberId, 'member']);
                $accountResult['member'] = $memberQuery->fetch() ?: null;
            }

            $memberId = clean_text($memberId ?: ($accountResult['member']['id'] ?? ''), 120);
            $accessResult = commerce_grant_digital_product_access($pdo, [
                'productId' => $productId,
                'memberId' => $memberId,
                'buyerEmail' => $buyerEmail,
                'buyerName' => $buyerName,
                'source' => 'paypal',
                'orderId' => $lockedOrder['merchant_ref'],
            ]);
            $accessGranted = !empty($accessResult['granted']);
            $emailContext = [
                'type' => 'digital_product',
                'accountResult' => $accountResult,
                'accessResult' => $accessResult,
            ];
        } else {
            $accessResult = commerce_grant_class_account_access($pdo, [
                'classId' => clean_text($orderPayload['class_id'] ?? ($lockedOrder['item_id'] ?? ''), 120),
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
                'buyerPhone' => $buyerPhone,
            ], $config);
            $memberId = clean_text($accessResult['member']['id'] ?? $memberId, 120);
            $bundleItems = commerce_grant_class_bundled_products($pdo, [
                'class' => $accessResult['class'] ?? [],
                'classId' => clean_text($orderPayload['class_id'] ?? ($lockedOrder['item_id'] ?? ''), 120),
                'memberId' => $memberId,
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
            ]);
            $accessGranted = !empty($accessResult['accessGranted']);
            $emailContext = [
                'type' => 'class',
                'accessResult' => $accessResult,
                'bundleItems' => $bundleItems,
            ];
        }

        $nextPayload = array_merge($orderPayload, [
            'capture' => $captureData,
            'webhook_event' => $event,
            'processed_at' => date(DATE_ATOM),
        ]);
        $update = $pdo->prepare(
            'UPDATE paypal_orders
            SET capture_id = ?, member_id = ?, status = ?, access_granted = ?, payload = ?
            WHERE id = ?',
        );
        $update->execute([
            $captureId,
            $memberId,
            'processed',
            $accessGranted ? 1 : 0,
            json_encode($nextPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $lockedOrder['id'],
        ]);

        if ($startedTransaction && $pdo->inTransaction()) {
            $pdo->commit();
        }

        $emailResult = ['sent' => false, 'message' => 'Email belum diproses.'];

        if (($emailContext['type'] ?? '') === 'bundle') {
            $accountResult = $emailContext['accountResult'];
            $emailResult = send_paypal_access_email([
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
                'itemType' => 'bundle',
                'itemTitle' => $lockedOrder['item_title'] ?? 'IbnuCreative bundle',
                'username' => $accountResult['member']['username'] ?? '',
                'password' => $accountResult['password'] ?? null,
                'items' => $emailContext['bundleItems'] ?? [],
                'loginUrl' => $accountResult['loginUrl'] ?? commerce_login_url($config),
            ]);
        } elseif (($emailContext['type'] ?? '') === 'digital_product') {
            $accessResult = $emailContext['accessResult'];
            $accountResult = $emailContext['accountResult'];
            $accessUrl = commerce_public_product_access_url(
                $lockedOrder['merchant_ref'],
                clean_text($accessResult['product']['product_type'] ?? ($orderPayload['product_type'] ?? 'digital'), 40),
            );
            $emailResult = send_paypal_access_email([
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
                'itemType' => 'digital_product',
                'itemTitle' => clean_text($accessResult['product']['title'] ?? ($lockedOrder['item_title'] ?? 'Digital product'), 180),
                'username' => clean_text($accountResult['member']['username'] ?? '', 120),
                'password' => $accountResult['password'] ?? null,
                'loginUrl' => $accountResult['loginUrl'] ?? commerce_login_url($config),
                'accessUrl' => $accessUrl,
                'deliveryNote' => clean_text($accessResult['product']['delivery_note'] ?? ($orderPayload['delivery_note'] ?? ''), 1200),
            ]);
        } elseif (($emailContext['type'] ?? '') === 'class') {
            $accessResult = $emailContext['accessResult'];
            $emailResult = send_paypal_access_email([
                'buyerName' => $buyerName,
                'buyerEmail' => $buyerEmail,
                'itemType' => 'class',
                'itemTitle' => clean_text($accessResult['class']['title'] ?? ($lockedOrder['item_title'] ?? 'IbnuCreative class'), 180),
                'username' => clean_text($accessResult['member']['username'] ?? '', 120),
                'password' => $accessResult['password'],
                'purchaseMessage' => clean_text($accessResult['class']['purchase_message'] ?? '', 2000),
                'loginUrl' => $accessResult['loginUrl'],
                'items' => $emailContext['bundleItems'] ?? [],
            ]);
        }

        return [
            'ok' => true,
            'message' => 'Pembayaran PayPal berhasil dan akses sudah diproses.',
            'captureId' => $captureId,
            'memberId' => $memberId,
            'accessGranted' => $accessGranted,
            'emailSent' => !empty($emailResult['sent']),
            'emailError' => !empty($emailResult['sent']) ? '' : clean_text($emailResult['message'] ?? '', 260),
            'redirectUrl' => paypal_success_url(
                array_merge($lockedOrder, ['member_id' => $memberId]),
                $orderPayload,
                $config,
            ),
        ];
    } catch (Throwable $error) {
        if ($startedTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $error;
    }
}
