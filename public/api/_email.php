<?php

declare(strict_types=1);

function email_clean_header($value, int $maxLength = 240): string
{
    return substr(str_replace(["\r", "\n"], '', trim((string) ($value ?? ''))), 0, $maxLength);
}

function email_escape($value): string
{
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES, 'UTF-8');
}

function email_escape_breaks($value): string
{
    return nl2br(email_escape($value), false);
}

function send_resend_email(array $message): array
{
    $config = api_config();
    $apiKey = clean_text($config['resend_api_key'] ?? '', 300);
    $from = email_clean_header($config['resend_from_email'] ?? ($config['lynk_email_from'] ?? ''), 240);
    $to = clean_email($message['to'] ?? '');

    if ($apiKey === '' || $from === '') {
        return ['sent' => false, 'message' => 'RESEND_API_KEY atau RESEND_FROM_EMAIL belum diisi.'];
    }

    if ($to === '') {
        return ['sent' => false, 'message' => 'Email tujuan tidak valid.'];
    }

    if (!function_exists('curl_init')) {
        return ['sent' => false, 'message' => 'Ekstensi cURL PHP belum aktif.'];
    }

    $payload = [
        'from' => $from,
        'to' => [$to],
        'subject' => email_clean_header($message['subject'] ?? 'IbnuCreative', 180),
        'text' => (string) ($message['text'] ?? ''),
        'html' => (string) ($message['html'] ?? ''),
    ];
    $curl = curl_init('https://api.resend.com/emails');

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
            'User-Agent: ibnucreative-domainesia-api',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 25,
    ]);

    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    $data = json_decode((string) $body, true);
    $data = is_array($data) ? $data : [];

    if ($body === false || $error !== '' || $status < 200 || $status >= 300) {
        error_log('IbnuCreative Resend failed: HTTP ' . $status . ' ' . ($error ?: ($data['message'] ?? $data['error'] ?? 'unknown error')));

        return [
            'sent' => false,
            'message' => clean_text($data['message'] ?? $data['error'] ?? 'Email Resend gagal dikirim.', 240),
        ];
    }

    return [
        'sent' => true,
        'id' => clean_text($data['id'] ?? ($data['data']['id'] ?? ''), 160),
    ];
}

function send_digital_product_delivery_email(array $order): array
{
    $downloadUrl = clean_asset_url($order['downloadUrl'] ?? '', 1000);
    $deliveryNote = (string) ($order['deliveryNote'] ?? '');
    $text = "Halo {$order['buyerName']},\n\n"
        . "Produk digital Anda sudah siap diakses.\n\n"
        . "Produk: {$order['productTitle']}\n"
        . ($downloadUrl ? "Link akses: {$downloadUrl}\n" : '')
        . ($deliveryNote ? "Catatan akses:\n{$deliveryNote}\n" : '')
        . "\nSimpan email ini untuk mengakses produk Anda kembali.\n\nIbnuCreative Academy";
    $button = $downloadUrl
        ? '<p><a href="' . email_escape($downloadUrl) . '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">Akses Produk</a></p>'
        : '';
    $html = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">'
        . '<h2>Produk digital Anda sudah siap</h2>'
        . '<p>Halo ' . email_escape($order['buyerName'] ?? 'Pelanggan') . ',</p>'
        . '<p>Produk digital Anda sudah siap. Silakan akses dari link berikut.</p>'
        . '<p><strong>Produk:</strong> ' . email_escape($order['productTitle'] ?? 'Produk digital') . '</p>'
        . $button
        . ($downloadUrl ? '<p>Jika tombol tidak bisa dibuka, salin link ini:<br><a href="' . email_escape($downloadUrl) . '">' . email_escape($downloadUrl) . '</a></p>' : '')
        . ($deliveryNote ? '<p><strong>Catatan akses:</strong><br>' . email_escape_breaks($deliveryNote) . '</p>' : '')
        . '<p>IbnuCreative Academy</p>'
        . '</div>';

    return send_resend_email([
        'to' => $order['buyerEmail'] ?? '',
        'subject' => 'Produk digital ' . ($order['productTitle'] ?? 'IbnuCreative') . ' sudah siap',
        'text' => $text,
        'html' => $html,
    ]);
}

function send_tripay_payment_email(array $order): array
{
    $checkoutUrl = clean_asset_url($order['checkoutUrl'] ?? '', 1000);
    $total = (int) ($order['totalAmount'] ?? $order['amount'] ?? 0);
    $text = "Halo {$order['buyerName']},\n\n"
        . "Invoice pembayaran Anda sudah dibuat.\n\n"
        . "Item: {$order['itemTitle']}\n"
        . "Total pembayaran: Rp " . number_format($total, 0, ',', '.') . "\n"
        . "Metode pembayaran: {$order['paymentMethod']}\n\n"
        . "Selesaikan pembayaran di link berikut:\n{$checkoutUrl}\n\n"
        . "Akses akan aktif otomatis setelah pembayaran sukses.\n\nIbnuCreative Academy";
    $html = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">'
        . '<h2>Invoice pembayaran IbnuCreative</h2>'
        . '<p>Halo ' . email_escape($order['buyerName'] ?? 'Member') . ',</p>'
        . '<p>Invoice pembayaran Anda sudah dibuat. Silakan selesaikan pembayaran agar akses aktif otomatis.</p>'
        . '<p><strong>Item:</strong> ' . email_escape($order['itemTitle'] ?? 'IbnuCreative') . '</p>'
        . '<p><strong>Total pembayaran:</strong> Rp ' . email_escape(number_format($total, 0, ',', '.')) . '</p>'
        . '<p><strong>Metode pembayaran:</strong> ' . email_escape($order['paymentMethod'] ?? '-') . '</p>'
        . '<p><a href="' . email_escape($checkoutUrl) . '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">Selesaikan Pembayaran</a></p>'
        . '<p>Jika tombol tidak bisa dibuka, salin link ini:<br><a href="' . email_escape($checkoutUrl) . '">' . email_escape($checkoutUrl) . '</a></p>'
        . '<p>IbnuCreative Academy</p>'
        . '</div>';

    return send_resend_email([
        'to' => $order['buyerEmail'] ?? '',
        'subject' => 'Selesaikan pembayaran ' . ($order['itemTitle'] ?? 'IbnuCreative'),
        'text' => $text,
        'html' => $html,
    ]);
}
