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

function send_password_reset_link_email(array $account): array
{
    $buyerName = clean_text($account['buyerName'] ?? 'Member', 160) ?: 'Member';
    $buyerEmail = clean_email($account['buyerEmail'] ?? '');
    $resetUrl = clean_asset_url($account['resetUrl'] ?? '', 1200);
    $expiresMinutes = max(5, (int) ($account['expiresMinutes'] ?? 30));
    $text = "Halo {$buyerName},\n\n"
        . "Kami menerima permintaan untuk mereset password akun IbnuCreative Anda.\n\n"
        . "Buat password baru melalui link berikut:\n{$resetUrl}\n\n"
        . "Link ini hanya bisa digunakan satu kali dan berlaku selama {$expiresMinutes} menit. Selama link masih aktif, sistem tidak akan mengirim link reset baru.\n\n"
        . "Jika Anda tidak meminta reset password, abaikan email ini. Password akun Anda tidak berubah.\n\n"
        . "IbnuCreative Academy";
    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:18px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.65">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="padding:22px 18px;background:#0f172a;color:#ffffff">'
        . '<p style="margin:0 0 8px;color:#bfdbfe;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Keamanan akun</p>'
        . '<h2 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3">Reset password akun Anda</h2>'
        . '</div><div style="padding:20px 16px">'
        . '<p style="margin:0 0 14px">Halo <strong>' . email_escape($buyerName) . '</strong>, kami menerima permintaan reset password untuk akun IbnuCreative Anda.</p>'
        . '<div style="margin:18px 0">' . email_button($resetUrl, 'Buat Password Baru', '#2563eb') . '</div>'
        . email_panel(
            'Link aman satu kali',
            '<p style="margin:0;color:#374151;font-size:14px">Link berlaku selama <strong>' . email_escape((string) $expiresMinutes) . ' menit</strong> dan hanya dapat digunakan satu kali. Sistem tidak akan mengirim link baru selama link ini masih aktif.</p>'
        )
        . ($resetUrl !== '' ? '<p style="margin:14px 0 0;color:#6b7280;font-size:12px;overflow-wrap:anywhere">Jika tombol tidak bekerja, salin link ini:<br><a href="' . email_escape($resetUrl) . '" style="color:#2563eb;overflow-wrap:anywhere">' . email_escape($resetUrl) . '</a></p>' : '')
        . '<p style="margin:18px 0 0;color:#374151;font-size:14px">Jika Anda tidak meminta reset password, abaikan email ini. Password akun tidak akan berubah.</p>'
        . '<p style="margin:22px 0 0">IbnuCreative Academy</p>'
        . '</div></div></div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Reset password akun IbnuCreative',
        'text' => $text,
        'html' => $html,
    ]);
}

function send_password_changed_email(array $account): array
{
    $buyerName = clean_text($account['buyerName'] ?? 'Member', 160) ?: 'Member';
    $buyerEmail = clean_email($account['buyerEmail'] ?? '');
    $wasReset = !empty($account['wasReset']);
    $action = $wasReset ? 'direset' : 'diganti';
    $text = "Halo {$buyerName},\n\n"
        . "Password akun IbnuCreative Anda berhasil {$action}.\n\n"
        . "Semua sesi lain telah dikeluarkan untuk melindungi akun Anda. Jika perubahan ini bukan dilakukan oleh Anda, segera hubungi admin IbnuCreative.\n\n"
        . "IbnuCreative Academy";
    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:18px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.65">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="padding:22px 18px;background:#166534;color:#ffffff">'
        . '<p style="margin:0 0 8px;color:#dcfce7;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Keamanan akun</p>'
        . '<h2 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3">Password berhasil ' . email_escape($action) . '</h2>'
        . '</div><div style="padding:20px 16px">'
        . '<p style="margin:0 0 14px">Halo <strong>' . email_escape($buyerName) . '</strong>, password akun IbnuCreative Anda berhasil ' . email_escape($action) . '.</p>'
        . '<p style="margin:0;color:#374151;font-size:14px">Semua sesi lain telah dikeluarkan untuk melindungi akun Anda. Jika perubahan ini bukan dilakukan oleh Anda, segera hubungi admin IbnuCreative.</p>'
        . '<p style="margin:22px 0 0">IbnuCreative Academy</p>'
        . '</div></div></div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Password akun IbnuCreative berhasil ' . $action,
        'text' => $text,
        'html' => $html,
    ]);
}

function send_paypal_payment_email(array $order): array
{
    $buyerName = clean_text($order['buyerName'] ?? 'Customer', 160) ?: 'Customer';
    $buyerEmail = clean_email($order['buyerEmail'] ?? '');
    $itemTitle = clean_text($order['itemTitle'] ?? 'IbnuCreative purchase', 180);
    $checkoutUrl = clean_asset_url($order['checkoutUrl'] ?? '', 1000);
    $currency = strtoupper(clean_text($order['currency'] ?? 'USD', 10)) ?: 'USD';
    $currencyValue = number_format((float) ($order['currencyValue'] ?? 0), 2, '.', ',');
    $amountIdr = max(0, (int) ($order['amountIdr'] ?? 0));
    $text = "Hi {$buyerName},\n\n"
        . "Your PayPal order has been created. Please complete the payment to activate your access.\n\n"
        . "Item: {$itemTitle}\n"
        . "PayPal total: {$currency} {$currencyValue}\n"
        . "Reference price: IDR " . number_format($amountIdr, 0, '.', ',') . "\n\n"
        . "Complete your payment:\n{$checkoutUrl}\n\n"
        . "Your account and purchased access will be activated automatically after PayPal confirms the payment.\n\n"
        . "IbnuCreative Academy";
    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:18px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.65">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="padding:22px 18px;background:#003087;color:#ffffff">'
        . '<p style="margin:0 0 8px;color:#dbeafe;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">PayPal payment</p>'
        . '<h2 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3">Complete your payment</h2>'
        . '</div><div style="padding:20px 16px">'
        . '<p style="margin:0 0 14px">Hi <strong>' . email_escape($buyerName) . '</strong>, your PayPal order is ready. Complete the payment to activate your purchase automatically.</p>'
        . email_panel('Order summary', email_data_rows([
            ['label' => 'Item', 'value' => $itemTitle],
            ['label' => 'PayPal total', 'value' => $currency . ' ' . $currencyValue],
            ['label' => 'Reference price', 'value' => 'IDR ' . number_format($amountIdr, 0, '.', ',')],
        ]))
        . '<div style="margin:16px 0">' . email_button($checkoutUrl, 'Complete PayPal Payment', '#0070ba') . '</div>'
        . '<p style="margin:14px 0;color:#374151;font-size:14px">Your account and purchased access will be activated automatically after PayPal confirms the payment.</p>'
        . ($checkoutUrl !== '' ? '<p style="margin:14px 0 0;color:#6b7280;font-size:12px;overflow-wrap:anywhere">If the button does not work, copy this link:<br><a href="' . email_escape($checkoutUrl) . '" style="color:#2563eb;overflow-wrap:anywhere">' . email_escape($checkoutUrl) . '</a></p>' : '')
        . '<p style="margin:22px 0 0">IbnuCreative Academy</p>'
        . '</div></div></div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Complete your PayPal payment for ' . $itemTitle,
        'text' => $text,
        'html' => $html,
    ]);
}

function send_paypal_access_email(array $order): array
{
    $buyerName = clean_text($order['buyerName'] ?? 'Customer', 160) ?: 'Customer';
    $buyerEmail = clean_email($order['buyerEmail'] ?? '');
    $itemType = clean_text($order['itemType'] ?? 'class', 40);
    $itemTitle = clean_text($order['itemTitle'] ?? 'IbnuCreative purchase', 180);
    $username = clean_text($order['username'] ?? '', 120);
    $passwordText = !empty($order['password'])
        ? (string) $order['password']
        : 'Use the password already registered to your account.';
    $loginUrl = clean_asset_url($order['loginUrl'] ?? '', 1000);
    $accessUrl = clean_asset_url($order['accessUrl'] ?? '', 1000);
    $deliveryNote = clean_text($order['deliveryNote'] ?? '', 1200);
    $purchaseMessage = clean_text($order['purchaseMessage'] ?? '', 2000);
    $items = is_array($order['items'] ?? null) ? $order['items'] : [];
    $typeLabel = $itemType === 'bundle'
        ? 'bundle'
        : ($itemType === 'digital_product' ? 'digital product' : 'class');
    $primaryUrl = $accessUrl ?: $loginUrl;
    $primaryLabel = $accessUrl !== '' ? 'Open Your Purchase' : 'Log In to Your Account';
    $itemText = '';
    $itemHtml = '';

    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }

        $rawType = clean_text($item['type'] ?? ($item['productType'] ?? ''), 40);
        $label = $rawType === 'class'
            ? 'Class'
            : ($rawType === 'prompt' || clean_text($item['productType'] ?? '', 40) === 'prompt'
                ? 'Prompt'
                : 'Digital product');
        $title = clean_text($item['title'] ?? ($item['productTitle'] ?? ''), 180) ?: $label;
        $itemUrl = clean_asset_url($item['accessUrl'] ?? '', 1000);
        $number = $index + 1;
        $itemText .= "{$number}. [{$label}] {$title}" . ($itemUrl !== '' ? "\n   Access: {$itemUrl}" : '') . "\n";
        $itemHtml .= '<li style="margin:0 0 9px;color:#374151"><strong>' . email_escape($label) . ':</strong> '
            . email_escape($title)
            . ($itemUrl !== '' ? '<br><a href="' . email_escape($itemUrl) . '" style="color:#2563eb">Open item</a>' : '')
            . '</li>';
    }

    $accountText = $username !== ''
        ? "Account email: {$buyerEmail}\nUsername: {$username}\nPassword: {$passwordText}\n"
        : "Account email: {$buyerEmail}\n";
    $text = "Hi {$buyerName},\n\n"
        . "Your PayPal payment has been confirmed and your {$typeLabel} access is now active.\n\n"
        . "Purchase: {$itemTitle}\n"
        . ($itemText !== '' ? "\nIncluded access:\n{$itemText}" : '')
        . "\n{$accountText}"
        . ($loginUrl !== '' ? "Login: {$loginUrl}\n" : '')
        . ($accessUrl !== '' ? "Direct access: {$accessUrl}\n" : '')
        . ($deliveryNote !== '' ? "\nAccess note:\n{$deliveryNote}\n" : '')
        . ($purchaseMessage !== '' ? "\nImportant message from the instructor:\n{$purchaseMessage}\n" : '')
        . "\nThank you for learning with IbnuCreative Academy.";
    $accountRows = [
        ['label' => 'Account email', 'value' => $buyerEmail],
    ];

    if ($username !== '') {
        $accountRows[] = ['label' => 'Username', 'value' => $username];
        $accountRows[] = ['label' => 'Password', 'value' => $passwordText];
    }

    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:18px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.65">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="padding:22px 18px;background:#0f172a;color:#ffffff">'
        . '<p style="margin:0 0 8px;color:#86efac;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Payment confirmed</p>'
        . '<h2 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3">Your access is ready</h2>'
        . '</div><div style="padding:20px 16px">'
        . '<p style="margin:0 0 14px">Hi <strong>' . email_escape($buyerName) . '</strong>, your PayPal payment has been confirmed and your purchase is now active.</p>'
        . email_panel('Purchase details', email_data_rows([
            ['label' => ucfirst($typeLabel), 'value' => $itemTitle],
        ]))
        . ($itemHtml !== '' ? email_panel('Included access', '<ul style="margin:0;padding-left:20px">' . $itemHtml . '</ul>') : '')
        . email_panel('Account details', email_data_rows($accountRows))
        . ($primaryUrl !== '' ? '<div style="margin:16px 0">' . email_button($primaryUrl, $primaryLabel, '#2563eb') . '</div>' : '')
        . ($deliveryNote !== '' ? email_panel('Access note', '<p style="margin:0;color:#374151;font-size:14px">' . email_escape_breaks($deliveryNote) . '</p>') : '')
        . ($purchaseMessage !== '' ? email_panel('Important message from the instructor', '<p style="margin:0;color:#374151;font-size:14px">' . email_escape_breaks($purchaseMessage) . '</p>') : '')
        . ($primaryUrl !== '' ? '<p style="margin:14px 0 0;color:#6b7280;font-size:12px;overflow-wrap:anywhere">If the button does not work, copy this link:<br><a href="' . email_escape($primaryUrl) . '" style="color:#2563eb;overflow-wrap:anywhere">' . email_escape($primaryUrl) . '</a></p>' : '')
        . '<p style="margin:22px 0 0">Thank you for learning with IbnuCreative Academy.</p>'
        . '</div></div></div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Payment confirmed — Your access to ' . $itemTitle . ' is ready',
        'text' => $text,
        'html' => $html,
    ]);
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

function send_class_bundle_access_email(array $order): array
{
    $buyerName = clean_text($order['buyerName'] ?? 'Peserta', 160) ?: 'Peserta';
    $buyerEmail = clean_email($order['buyerEmail'] ?? '');
    $classTitle = clean_text($order['classTitle'] ?? 'Kelas IbnuCreative', 300) ?: 'Kelas IbnuCreative';
    $bundleItems = is_array($order['bundleItems'] ?? null) ? $order['bundleItems'] : [];
    $items = [];
    $seenProductIds = [];

    foreach ($bundleItems as $item) {
        if (!is_array($item)) {
            continue;
        }

        $productId = clean_text($item['productId'] ?? '', 120);

        if ($productId !== '' && isset($seenProductIds[$productId])) {
            continue;
        }

        if ($productId !== '') {
            $seenProductIds[$productId] = true;
        }

        $productType = clean_text($item['productType'] ?? 'digital', 40) === 'prompt' ? 'prompt' : 'digital';
        $items[] = [
            'title' => clean_text($item['productTitle'] ?? '', 180) ?: ($productType === 'prompt' ? 'Prompt' : 'Produk digital'),
            'type' => $productType,
            'accessUrl' => clean_asset_url($item['accessUrl'] ?? '', 1000),
            'deliveryNote' => clean_text($item['deliveryNote'] ?? '', 1200),
        ];
    }

    if (!$items) {
        return ['sent' => false, 'message' => 'Kelas tidak memiliki bonus produk atau prompt.'];
    }

    $textItems = '';
    $htmlItems = '';

    foreach ($items as $index => $item) {
        $itemLabel = $item['type'] === 'prompt' ? 'Prompt' : 'Produk digital';
        $itemNumber = $index + 1;
        $textItems .= "{$itemNumber}. [{$itemLabel}] {$item['title']}\n"
            . ($item['accessUrl'] !== '' ? "Link akses: {$item['accessUrl']}\n" : '')
            . ($item['deliveryNote'] !== '' ? "Catatan akses: {$item['deliveryNote']}\n" : '')
            . "\n";
        $htmlItems .= email_panel(
            $itemNumber . '. ' . $itemLabel . ' - ' . $item['title'],
            ($item['accessUrl'] !== ''
                ? '<div>' . email_button($item['accessUrl'], $item['type'] === 'prompt' ? 'Akses Prompt' : 'Akses Produk') . '</div>'
                . '<p style="margin:8px 0 0;color:#6b7280;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">Link akses:<br><a href="' . email_escape($item['accessUrl']) . '" style="color:#2563eb;overflow-wrap:anywhere;word-break:break-word">' . email_escape($item['accessUrl']) . '</a></p>'
                : '<p style="margin:0;color:#6b7280;font-size:13px">Buka dashboard member untuk mengakses bonus ini.</p>')
            . ($item['deliveryNote'] !== ''
                ? '<p style="margin:12px 0 0;color:#374151;font-size:13px;line-height:1.6"><strong>Catatan akses:</strong><br>' . email_escape_breaks($item['deliveryNote']) . '</p>'
                : '')
        );
    }

    $text = "Halo {$buyerName},\n\n"
        . "Bonus dari checkout kelas Anda sudah aktif.\n\n"
        . "Kelas: {$classTitle}\n\n"
        . $textItems
        . "Anda juga dapat membuka bonus ini dari dashboard member.\n\nIbnuCreative Academy";
    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:16px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.6;overflow-wrap:break-word">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="box-sizing:border-box;width:100%;padding:20px 16px 16px;background:#1d4ed8;color:#ffffff">'
        . '<p style="margin:0 0 8px;color:#dbeafe;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Bonus checkout kelas</p>'
        . '<h2 style="margin:0;font-size:24px;line-height:1.25;color:#ffffff">Produk digital dan prompt Anda sudah aktif</h2>'
        . '</div>'
        . '<div style="box-sizing:border-box;width:100%;padding:18px 14px">'
        . '<p style="margin:0 0 10px;color:#374151;font-size:15px;line-height:1.7">Halo <strong style="color:#111827">' . email_escape($buyerName) . '</strong>, berikut bonus yang Anda dapatkan setelah checkout kelas.</p>'
        . '<p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.6"><strong>Kelas:</strong> ' . email_escape($classTitle) . '</p>'
        . $htmlItems
        . '<p style="margin:18px 0 0;color:#374151;font-size:14px">Bonus juga tersedia di dashboard member Anda.</p>'
        . '<p style="margin:22px 0 0;color:#374151;font-size:14px">IbnuCreative Academy</p>'
        . '</div>'
        . '</div>'
        . '</div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Bonus kelas ' . $classTitle . ' sudah siap',
        'text' => $text,
        'html' => $html,
    ]);
}

function send_bundle_access_credentials_email(array $order): array
{
    $buyerName = clean_text($order['buyerName'] ?? 'Peserta', 160) ?: 'Peserta';
    $buyerEmail = clean_email($order['buyerEmail'] ?? '');
    $username = clean_text($order['username'] ?? '', 120);
    $passwordText = !empty($order['password'])
        ? (string) $order['password']
        : 'Gunakan password akun yang sudah terdaftar.';
    $bundleTitle = clean_text($order['bundleTitle'] ?? 'Paket bundling IbnuCreative', 180);
    $loginUrl = clean_asset_url($order['loginUrl'] ?? '', 1000);
    $bundleItems = is_array($order['bundleItems'] ?? null) ? $order['bundleItems'] : [];
    $itemLines = [];
    $itemRows = '';

    foreach ($bundleItems as $item) {
        if (!is_array($item)) {
            continue;
        }

        $type = clean_text($item['type'] ?? '', 40);
        $label = $type === 'class'
            ? 'Kelas'
            : (clean_text($item['productType'] ?? '', 40) === 'prompt' ? 'Prompt' : 'Produk digital');
        $title = clean_text($item['title'] ?? '', 180) ?: $label;
        $itemLines[] = "- [{$label}] {$title}";
        $itemRows .= '<li style="margin:0 0 7px;color:#374151"><strong>' . email_escape($label) . ':</strong> ' . email_escape($title) . '</li>';
    }

    $itemsText = $itemLines ? implode("\n", $itemLines) : '- Seluruh isi paket bundling';
    $loginButton = $loginUrl ? email_button($loginUrl, 'Login dan buka bundling', '#2563eb') : '';
    $text = "Halo {$buyerName},\n\n"
        . "Pembayaran paket bundling Anda sudah berhasil dan seluruh akses yang dibeli sudah aktif.\n\n"
        . "Paket: {$bundleTitle}\n"
        . "{$itemsText}\n\n"
        . "Email: {$buyerEmail}\n"
        . "Username: {$username}\n"
        . "Password: {$passwordText}\n"
        . ($loginUrl ? "Login: {$loginUrl}\n\n" : "\n")
        . "Silakan login menggunakan akun tersebut. Kelas tersedia di Kelas Saya, sedangkan produk digital dan prompt tersedia di menu produk akun Anda.\n\n"
        . "IbnuCreative Academy";
    $html = '<div style="box-sizing:border-box;width:100%;margin:0;padding:16px 8px;background:#f8fafc;font-family:Arial,sans-serif;color:#111827;line-height:1.6">'
        . '<div style="box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">'
        . '<div style="padding:20px 16px;background:#0f172a;color:#fff">'
        . '<p style="margin:0 0 8px;color:#bfdbfe;font-size:13px;font-weight:700;text-transform:uppercase">Pembayaran berhasil</p>'
        . '<h2 style="margin:0;color:#fff;font-size:24px">Akses bundling Anda sudah aktif</h2>'
        . '</div>'
        . '<div style="padding:18px 14px">'
        . '<p>Halo <strong>' . email_escape($buyerName) . '</strong>, seluruh akses dari paket <strong>' . email_escape($bundleTitle) . '</strong> sudah dapat digunakan.</p>'
        . '<ul style="margin:14px 0;padding-left:20px">' . ($itemRows ?: '<li>Seluruh isi paket bundling</li>') . '</ul>'
        . email_panel('Data login akun', email_data_rows([
            ['label' => 'Email', 'value' => $buyerEmail],
            ['label' => 'Username', 'value' => $username],
            ['label' => 'Password', 'value' => $passwordText],
        ]))
        . ($loginButton ? '<div style="margin:16px 0">' . $loginButton . '</div>' : '')
        . '<p style="color:#374151;font-size:14px">Silakan login menggunakan akun yang terdaftar. Kelas tersedia di menu Kelas Saya; produk digital dan prompt tersedia di menu produk akun Anda.</p>'
        . '<p style="margin-top:22px">IbnuCreative Academy</p>'
        . '</div></div></div>';

    return send_resend_email([
        'to' => $buyerEmail,
        'subject' => 'Akses bundling ' . $bundleTitle . ' sudah aktif',
        'text' => $text,
        'html' => $html,
    ]);
}

function send_tripay_payment_email(array $order): array
{
    $checkoutUrl = clean_asset_url($order['checkoutUrl'] ?? '', 1000);
    $total = (int) ($order['totalAmount'] ?? $order['amount'] ?? 0);
    $subtotal = (int) ($order['subtotal'] ?? $total);
    $discount = max(0, (int) ($order['discountAmount'] ?? 0));
    $voucher = is_array($order['voucher'] ?? null) ? $order['voucher'] : [];
    $voucherCode = substr(preg_replace('/[^A-Z0-9_-]/', '', strtoupper(trim((string) ($voucher['code'] ?? '')))) ?? '', 0, 60);
    $voucherText = $discount > 0
        ? "Subtotal: Rp " . number_format($subtotal, 0, ',', '.') . "\n"
            . "Voucher" . ($voucherCode !== '' ? " ({$voucherCode})" : '') . ": -Rp " . number_format($discount, 0, ',', '.') . "\n"
        : '';
    $voucherHtml = $discount > 0
        ? '<p style="margin-bottom:4px"><strong>Subtotal:</strong> Rp ' . email_escape(number_format($subtotal, 0, ',', '.')) . '</p>'
            . '<p style="margin-top:4px"><strong>Voucher' . ($voucherCode !== '' ? ' (' . email_escape($voucherCode) . ')' : '') . ':</strong> -Rp ' . email_escape(number_format($discount, 0, ',', '.')) . '</p>'
        : '';
    $text = "Halo {$order['buyerName']},\n\n"
        . "Invoice pembayaran Anda sudah dibuat.\n\n"
        . "Item: {$order['itemTitle']}\n"
        . $voucherText
        . "Total pembayaran: Rp " . number_format($total, 0, ',', '.') . "\n"
        . "Metode pembayaran: {$order['paymentMethod']}\n\n"
        . "Selesaikan pembayaran di link berikut:\n{$checkoutUrl}\n\n"
        . "Akses akan aktif otomatis setelah pembayaran sukses.\n\nIbnuCreative Academy";
    $html = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">'
        . '<h2>Invoice pembayaran IbnuCreative</h2>'
        . '<p>Halo ' . email_escape($order['buyerName'] ?? 'Member') . ',</p>'
        . '<p>Invoice pembayaran Anda sudah dibuat. Silakan selesaikan pembayaran agar akses aktif otomatis.</p>'
        . '<p><strong>Item:</strong> ' . email_escape($order['itemTitle'] ?? 'IbnuCreative') . '</p>'
        . $voucherHtml
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
