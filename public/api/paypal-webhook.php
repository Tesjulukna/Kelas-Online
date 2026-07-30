<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_tripay.php';
require __DIR__ . '/_email.php';
require __DIR__ . '/_commerce.php';
require __DIR__ . '/_paypal.php';

ensure_method(['POST']);

$pdo = db();
$config = api_config();
$rawBody = file_get_contents('php://input') ?: '';
$event = json_decode($rawBody, true);

if (!is_array($event)) {
    send_json(400, ['message' => 'Payload webhook PayPal tidak valid.']);
}

paypal_assert_config($config, true, false);
paypal_ensure_schema($pdo);

if (!paypal_verify_webhook($config, $event)) {
    send_json(401, ['message' => 'Signature webhook PayPal tidak valid.']);
}

$eventId = clean_text($event['id'] ?? '', 180);
$eventType = strtoupper(clean_text($event['event_type'] ?? '', 120));
$resource = is_array($event['resource'] ?? null) ? $event['resource'] : [];
$resourceId = clean_text($resource['id'] ?? '', 180);

if ($eventId === '' || $eventType === '') {
    send_json(422, ['message' => 'Event ID atau event type PayPal tidak tersedia.']);
}

$insertEvent = $pdo->prepare(
    'INSERT IGNORE INTO paypal_webhook_events
    (id, event_type, resource_id, status, payload)
    VALUES (?, ?, ?, ?, ?)',
);
$insertEvent->execute([$eventId, $eventType, $resourceId, 'received', $rawBody]);

if ($insertEvent->rowCount() === 0) {
    $existingEventQuery = $pdo->prepare('SELECT status FROM paypal_webhook_events WHERE id = ? LIMIT 1');
    $existingEventQuery->execute([$eventId]);
    $existingEvent = $existingEventQuery->fetch();

    if (strtolower(clean_text($existingEvent['status'] ?? '', 40)) === 'processed') {
        send_json(200, [
            'ok' => true,
            'duplicate' => true,
            'message' => 'Webhook PayPal sudah pernah diproses.',
        ]);
    }

    $retryEvent = $pdo->prepare(
        'UPDATE paypal_webhook_events
        SET event_type = ?, resource_id = ?, status = ?, payload = ?, processed_at = NULL
        WHERE id = ?',
    );
    $retryEvent->execute([$eventType, $resourceId, 'received', $rawBody, $eventId]);
}

$relatedIds = is_array($resource['supplementary_data']['related_ids'] ?? null)
    ? $resource['supplementary_data']['related_ids']
    : [];
$paypalOrderId = clean_text($relatedIds['order_id'] ?? '', 180);

if (in_array($eventType, [
    'CHECKOUT.ORDER.APPROVED',
    'CHECKOUT.ORDER.DECLINED',
    'CHECKOUT.ORDER.VOIDED',
    'CHECKOUT.PAYMENT-APPROVAL.REVERSED',
], true)) {
    $paypalOrderId = clean_text($resource['id'] ?? '', 180);
}

$order = null;

if ($paypalOrderId !== '') {
    $orderQuery = $pdo->prepare('SELECT * FROM paypal_orders WHERE paypal_order_id = ? LIMIT 1');
    $orderQuery->execute([$paypalOrderId]);
    $order = $orderQuery->fetch() ?: null;
}

if (!$order && $resourceId !== '') {
    $captureQuery = $pdo->prepare('SELECT * FROM paypal_orders WHERE capture_id = ? LIMIT 1');
    $captureQuery->execute([$resourceId]);
    $order = $captureQuery->fetch() ?: null;
}

try {
    $result = ['ok' => true, 'ignored' => true];

    if ($eventType === 'CHECKOUT.ORDER.APPROVED' && $order) {
        $markApproved = $pdo->prepare('UPDATE paypal_orders SET status = ? WHERE id = ? AND status <> ?');
        $markApproved->execute(['approved', $order['id'], 'processed']);
        $captureResult = paypal_capture_order(
            $config,
            $order['paypal_order_id'],
            $order['merchant_ref'] . '-capture',
        );

        if (!empty($captureResult['ok'])) {
            $captureData = paypal_capture_from_response($captureResult['data']);

            if ($captureData && strtoupper(clean_text($captureData['status'] ?? '', 40)) === 'COMPLETED') {
                $result = paypal_fulfill_order($pdo, $config, $order, $captureData, $event);
            } else {
                $markPending = $pdo->prepare('UPDATE paypal_orders SET status = ? WHERE id = ?');
                $markPending->execute(['pending', $order['id']]);
                $result = ['ok' => true, 'pending' => true];
            }
        } else {
            $freshQuery = $pdo->prepare('SELECT * FROM paypal_orders WHERE id = ? LIMIT 1');
            $freshQuery->execute([$order['id']]);
            $freshOrder = $freshQuery->fetch() ?: $order;

            if (strtolower(clean_text($freshOrder['status'] ?? '', 40)) !== 'processed') {
                throw new RuntimeException(
                    paypal_api_error_message($captureResult, 'Capture PayPal dari webhook gagal.'),
                );
            }

            $result = ['ok' => true, 'duplicate' => true];
        }
    } elseif ($eventType === 'PAYMENT.CAPTURE.COMPLETED' && $order) {
        $result = paypal_fulfill_order($pdo, $config, $order, $resource, $event);
    } elseif ($order && in_array($eventType, [
        'PAYMENT.CAPTURE.PENDING',
        'PAYMENT.CAPTURE.DECLINED',
        'PAYMENT.CAPTURE.DENIED',
        'PAYMENT.CAPTURE.REFUNDED',
        'PAYMENT.CAPTURE.REVERSED',
        'CHECKOUT.PAYMENT-APPROVAL.REVERSED',
        'CHECKOUT.ORDER.DECLINED',
        'CHECKOUT.ORDER.VOIDED',
    ], true)) {
        $statusMap = [
            'PAYMENT.CAPTURE.PENDING' => 'pending',
            'PAYMENT.CAPTURE.DECLINED' => 'declined',
            'PAYMENT.CAPTURE.DENIED' => 'declined',
            'PAYMENT.CAPTURE.REFUNDED' => 'refunded',
            'PAYMENT.CAPTURE.REVERSED' => 'reversed',
            'CHECKOUT.PAYMENT-APPROVAL.REVERSED' => 'reversed',
            'CHECKOUT.ORDER.DECLINED' => 'declined',
            'CHECKOUT.ORDER.VOIDED' => 'voided',
        ];
        $orderPayload = paypal_order_payload($order);
        $orderPayload['last_webhook_event'] = $event;
        $updateOrder = $pdo->prepare('UPDATE paypal_orders SET status = ?, payload = ? WHERE id = ?');
        $updateOrder->execute([
            $statusMap[$eventType],
            json_encode($orderPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $order['id'],
        ]);
        $result = ['ok' => true, 'status' => $statusMap[$eventType]];
    }

    $updateEvent = $pdo->prepare(
        'UPDATE paypal_webhook_events SET status = ?, processed_at = NOW() WHERE id = ?',
    );
    $updateEvent->execute(['processed', $eventId]);

    send_json(200, array_merge([
        'ok' => true,
        'eventType' => $eventType,
        'message' => $order
            ? 'Webhook PayPal berhasil diproses.'
            : 'Webhook PayPal valid tetapi tidak terkait order website.',
    ], $result));
} catch (Throwable $error) {
    $updateEvent = $pdo->prepare(
        'UPDATE paypal_webhook_events SET status = ?, processed_at = NOW() WHERE id = ?',
    );
    $updateEvent->execute(['failed', $eventId]);
    send_json(500, [
        'message' => clean_text($error->getMessage(), 300) ?: 'Webhook PayPal belum bisa diproses.',
    ]);
}
