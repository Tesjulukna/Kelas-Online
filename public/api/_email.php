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

function email_button(string $url, string $label, string $background = '#2563eb', string $color = '#ffffff'): string
{
    $safeUrl = email_escape($url);
    $safeLabel = email_escape($label);

    return '<a href="' . $safeUrl . '" style="display:inline-block;box-sizing:border-box;max-width:100%;margin:6px 8px 6px 0;padding:12px 18px;border-radius:10px;background:' . $background . ';color:' . $color . ';text-decoration:none;font-weight:700;font-size:14px;line-height:1.2;text-align:center;overflow-wrap:break-word">' . $safeLabel . '</a>';
}

function email_panel(string $title, string $content): string
{
    return '<div style="box-sizing:border-box;width:100%;max-width:100%;margin:16px 0;padding:14px;border:1px solid #e5e7eb;border-radius:14px;background:#ffffff;overflow-wrap:break-word;word-break:normal">'
        . '<h3 style="margin:0 0 10px;font-size:15px;line-height:1.3;color:#111827">' . email_escape($title) . '</h3>'
        . $content
        . '</div>';
}

function email_data_rows(array $rows): string
{
    $html = '<div style="box-sizing:border-box;width:100%;max-width:100%">';

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $label = email_escape($row['label'] ?? '');
        $value = email_escape($row['value'] ?? '');

        $html .= '<div style="box-sizing:border-box;width:100%;max-width:100%;padding:8px 0;border-bottom:1px solid #f1f5f9">'
            . '<div style="margin:0 0 3px;color:#6b7280;font-size:12px;line-height:1.35;font-weight:700;text-transform:uppercase;letter-spacing:.03em">' . $label . '</div>'
            . '<div style="margin:0;color:#111827;font-size:15px;line-height:1.5;font-weight:700;white-space:normal;overflow-wrap:anywhere;word-break:break-word">' . $value . '</div>'
            . '</div>';
    }

    return $html . '</div>';
}

function email_extract_links(string $message): array
{
    if ($message === '') {
        return [];
    }

    preg_match_all('/https?:\/\/[^\s<>"\']+/i', $message, $matches);
    $links = [];

    foreach ($matches[0] ?? [] as $link) {
        $link = rtrim($link, ".,);]\r\n\t ");
        $safeLink = clean_asset_url($link, 1200);

        if ($safeLink !== '') {
            $links[] = $safeLink;
        }
    }

    return array_values(array_unique($links));
}

function email_admin_link_label(string $url): string
{
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));

    if (strpos($host, 'chat.whatsapp.com') !== false) {
        return 'Masuk Grup';
    }

    if (strpos($host, 'wa.me') !== false || strpos($host, 'whatsapp.com') !== false) {
        return 'Konfirmasi Pembayaran';
    }

    if (strpos($host, 't.me') !== false || strpos($host, 'telegram') !== false) {
        return 'Masuk Grup';
    }

    return 'Buka Link';
}

function email_admin_message_text(string $message): string
{
    $message = trim($message);

    if ($message === '') {
        return '';
    }

    $cleaned = preg_replace('/https?:\/\/[^\s<>"\']+/i', '', $message) ?? $message;
    $cleaned = preg_replace("/[ \t]+\n/", "\n", $cleaned) ?? $cleaned;
    $cleaned = preg_replace("/\n{3,}/", "\n\n", $cleaned) ?? $cleaned;

    return trim($cleaned);
}

function email_admin_message_html(string $message, string $title = 'Pesan dari admin'): string
{
    $message = trim($message);

    if ($message === '') {
        return '';
    }

    $links = email_extract_links($message);
    $text = email_admin_message_text($message);
    $body = $text !== ''
        ? '<div style="margin:0;color:#374151;font-size:14px;line-height:1.65">' . email_escape_breaks($text) . '</div>'
        : '<p style="margin:0;color:#374151;font-size:14px;line-height:1.65">Silakan gunakan tombol berikut untuk melanjutkan.</p>';

    if ($links) {
        $body .= '<div style="margin-top:12px">';

        foreach ($links as $link) {
            $label = email_admin_link_label($link);
            $color = $label === 'Konfirmasi Pembayaran' ? '#16a34a' : '#0f766e';
            $body .= email_button($link, $label, $color);
        }

        $body .= '</div>';
    }

    return email_panel($title, $body);
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
        $responseMessage = clean_text($data['message'] ?? $data['error'] ?? '', 220);
        $failureMessage = $error !== ''
            ? 'cURL: ' . clean_text($error, 220)
            : ($responseMessage !== '' ? $responseMessage : 'Email Resend gagal dikirim.');
        $debugMessage = 'HTTP ' . ($status ?: 0) . ': ' . $failureMessage;

        error_log('IbnuCreative Resend failed: ' . $debugMessage);

        return [
            'sent' => false,
            'message' => clean_text($debugMessage, 260),
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
    $isPrompt = clean_text($order['productType'] ?? '', 40) === 'prompt';
    $itemLabel = $isPrompt ? 'Prompt' : 'Produk digital';
    $text = "Halo {$order['buyerName']},\n\n"
        . "{$itemLabel} Anda sudah siap diakses.\n\n"
        . "{$itemLabel}: {$order['productTitle']}\n"
        . ($downloadUrl ? "Link akses: {$downloadUrl}\n" : '')
        . ($deliveryNote ? "Catatan akses:\n{$deliveryNote}\n" : '')
        . "\nSimpan email ini untuk mengakses produk Anda kembali.\n\nIbnuCreative Academy";
    $button = $downloadUrl
        ? '<p><a href="' . email_escape($downloadUrl) . '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">' . ($isPrompt ? 'Akses Prompt' : 'Akses Produk') . '</a></p>'
        : '';
    $html = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">'
        . '<h2>' . email_escape($itemLabel) . ' Anda sudah siap</h2>'
        . '<p>Halo ' . email_escape($order['buyerName'] ?? 'Pelanggan') . ',</p>'
        . '<p>' . email_escape($itemLabel) . ' Anda sudah siap. Silakan akses dari link berikut.</p>'
        . '<p><strong>' . email_escape($itemLabel) . ':</strong> ' . email_escape($order['productTitle'] ?? $itemLabel) . '</p>'
        . $button
        . ($downloadUrl ? '<p>Jika tombol tidak bisa dibuka, salin link ini:<br><a href="' . email_escape($downloadUrl) . '">' . email_escape($downloadUrl) . '</a></p>' : '')
        . ($deliveryNote ? '<p><strong>Catatan akses:</strong><br>' . email_escape_breaks($deliveryNote) . '</p>' : '')
        . '<p>IbnuCreative Academy</p>'
        . '</div>';

    return send_resend_email([
        'to' => $order['buyerEmail'] ?? '',
        'subject' => $itemLabel . ' ' . ($order['productTitle'] ?? 'IbnuCreative') . ' sudah siap',
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

function send_class_access_credentials_email(array $account): array
{
    $loginUrl = clean_asset_url($account['loginUrl'] ?? '', 1000);
    $passwordText = !empty($account['password'])
        ? (string) $account['password']
        : 'Gunakan password akun yang sudah pernah dibuat.';
    $classTitle = clean_text($account['classTitle'] ?? 'Kelas IbnuCreative', 180);
    $buyerName = clean_text($account['buyerName'] ?? 'Peserta', 160);
    $username = clean_text($account['username'] ?? '', 120);
    $buyerEmail = clean_email($account['buyerEmail'] ?? '');
    $purchaseMessage = clean_text($account['purchaseMessage'] ?? '', 2000);
    $purchaseMessageCleanText = email_admin_message_text($purchaseMessage);
    $purchaseLinks = email_extract_links($purchaseMessage);
    $purchaseMessageText = '';

    if ($purchaseMessageCleanText !== '' || $purchaseLinks) {
        $purchaseMessageText .= "Pesan dari admin:\n";

        if ($purchaseMessageCleanText !== '') {
            $purchaseMessageText .= $purchaseMessageCleanText . "\n";
        }

        foreach ($purchaseLinks as $link) {
            $purchaseMessageText .= email_admin_link_label($link) . ": {$link}\n";
        }

        $purchaseMessageText .= "\n";
    }

    $text = "Halo {$buyerName},\n\n"
        . "Pembayaran kelas Anda sudah berhasil dan akses belajar sudah aktif.\n\n"
        . "Kelas: {$classTitle}\n"
        . "Email: {$buyerEmail}\n"
        . "Username: {$username}\n"
        . "Password: {$passwordText}\n"
        . ($loginUrl ? "Login: {$loginUrl}\n" : '')
        . "\n"
        . $purchaseMessageText
        . "Silakan login dan buka menu Kelas Saya.\n\n"
        . "IbnuCreative Academy";

    $loginButton = $loginUrl
        ? email_button($loginUrl, 'Masuk ke Kelas Saya', '#2563eb')
        : '';
    $classPanel = email_panel(
        '1. Detail kelas',
        '<p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#111827">' . email_escape($classTitle) . '</strong></p>'
    );
    $accountPanel = email_panel(
        '2. Data login akun',
        email_data_rows([
            ['label' => 'Email', 'value' => $buyerEmail],
            ['label' => 'Username', 'value' => $username],
            ['label' => 'Password', 'value' => $passwordText],
        ])
    );
    $actionPanel = $loginButton
        ? email_panel(
            '3. Buka kelas',
            '<p style="margin:0 0 10px;color:#374151;font-size:14px;line-height:1.6">Gunakan tombol ini untuk masuk ke dashboard belajar.</p>'
            . '<div>' . $loginButton . '</div>'
        )
        : '';
    $adminPanel = email_admin_message_html($purchaseMessage, $loginButton ? '4. Pesan dan link penting dari admin' : '3. Pesan dan link penting dari admin');
    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:16px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.6;overflow-wrap:break-word">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="box-sizing:border-box;width:100%;padding:20px 16px 16px;background:#0f172a;color:#ffffff">'
        . '<p style="margin:0 0 8px;color:#bfdbfe;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Pembayaran berhasil</p>'
        . '<h2 style="margin:0;font-size:24px;line-height:1.25;color:#ffffff">Akses kelas Anda sudah aktif</h2>'
        . '</div>'
        . '<div style="box-sizing:border-box;width:100%;padding:18px 14px">'
        . '<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.7">Halo <strong style="color:#111827">' . email_escape($buyerName) . '</strong>, pembayaran Anda sudah berhasil. Berikut detail akun dan langkah berikutnya.</p>'
        . $classPanel
        . $accountPanel
        . $actionPanel
        . $adminPanel
        . ($loginUrl ? '<p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">Jika tombol tidak bisa dibuka, salin link login ini:<br><a href="' . email_escape($loginUrl) . '" style="color:#2563eb;overflow-wrap:anywhere;word-break:break-word">' . email_escape($loginUrl) . '</a></p>' : '')
        . '<p style="margin:22px 0 0;color:#374151;font-size:14px">IbnuCreative Academy</p>'
        . '</div>'
        . '</div>'
        . '</div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Akses kelas ' . $classTitle . ' sudah aktif',
        'text' => $text,
        'html' => $html,
    ]);
}

function send_product_access_credentials_email(array $account): array
{
    $loginUrl = clean_asset_url($account['loginUrl'] ?? '', 1000);
    $accessUrl = clean_asset_url($account['accessUrl'] ?? '', 1000);
    $passwordText = !empty($account['password'])
        ? (string) $account['password']
        : 'Gunakan password akun yang sudah pernah dibuat.';
    $productTitle = clean_text($account['productTitle'] ?? 'Produk digital IbnuCreative', 180);
    $buyerName = clean_text($account['buyerName'] ?? 'Pelanggan', 160);
    $username = clean_text($account['username'] ?? '', 120);
    $buyerEmail = clean_email($account['buyerEmail'] ?? '');

    $text = "Halo {$buyerName},\n\n"
        . "Pembelian produk digital Anda sudah berhasil. Kami juga sudah menyiapkan akun member untuk mengakses produk dari dashboard.\n\n"
        . "Produk: {$productTitle}\n"
        . "Login: {$loginUrl}\n"
        . "Email: {$buyerEmail}\n"
        . "Username: {$username}\n"
        . "Password: {$passwordText}\n"
        . ($accessUrl ? "\nLink akses produk: {$accessUrl}\n" : '')
        . "\nSilakan login dan buka menu Produk Digital.\n\n"
        . "IbnuCreative Academy";

    $loginButton = $loginUrl
        ? '<p><a href="' . email_escape($loginUrl) . '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">Masuk ke Produk Digital</a></p>'
        : '';
    $accessButton = $accessUrl
        ? '<p><a href="' . email_escape($accessUrl) . '" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#eef2ff;color:#1d4ed8;text-decoration:none;font-weight:700">Buka Akses Produk</a></p>'
        : '';
    $html = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">'
        . '<h2>Akun produk digital Anda sudah aktif</h2>'
        . '<p>Halo ' . email_escape($buyerName) . ',</p>'
        . '<p>Pembelian produk digital Anda sudah berhasil. Kami juga sudah menyiapkan akun member untuk mengakses produk dari dashboard.</p>'
        . '<p><strong>Produk:</strong> ' . email_escape($productTitle) . '</p>'
        . '<p><strong>Email:</strong> ' . email_escape($buyerEmail) . '<br>'
        . '<strong>Username:</strong> ' . email_escape($username) . '<br>'
        . '<strong>Password:</strong> ' . email_escape($passwordText) . '</p>'
        . $loginButton
        . $accessButton
        . ($loginUrl ? '<p>Jika tombol login tidak bisa dibuka, salin link ini:<br><a href="' . email_escape($loginUrl) . '">' . email_escape($loginUrl) . '</a></p>' : '')
        . '<p>IbnuCreative Academy</p>'
        . '</div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Akun akses produk ' . $productTitle . ' sudah aktif',
        'text' => $text,
        'html' => $html,
    ]);
}
