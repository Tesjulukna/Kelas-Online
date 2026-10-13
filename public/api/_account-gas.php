<?php

declare(strict_types=1);

function account_gas_config(): array
{
    $config = api_config();
    $url = trim((string) (getenv('GOOGLE_SHEETS_GAS_URL') ?: ($config['google_sheets_gas_url'] ?? '')));
    $secret = (string) (getenv('GOOGLE_SHEETS_GAS_SECRET') ?: ($config['google_sheets_gas_secret'] ?? ''));
    if ($url === '' || strlen($secret) < 32) throw new RuntimeException('Koneksi GAS belum dikonfigurasi. Isi URL Web App dan kunci koneksi di server.');
    if (!preg_match('#^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$#', $url)) {
        throw new RuntimeException('URL GAS harus berupa URL deployment https://script.google.com/macros/s/.../exec.');
    }
    return ['url' => $url, 'secret' => $secret];
}

function account_gas_redirect_allowed(string $url): bool
{
    $parts = parse_url($url);
    return is_array($parts) && ($parts['scheme'] ?? '') === 'https'
        && ($parts['host'] ?? '') === 'script.googleusercontent.com'
        && ($parts['port'] ?? 443) === 443 && !isset($parts['user']) && !isset($parts['pass']);
}

function account_gas_result(string $body): array
{
    $response = json_decode($body, true);
    if (!is_array($response) || !array_key_exists('ok', $response)) {
        throw new RuntimeException('GAS tidak mengembalikan JSON. Deploy sebagai Web app, Execute as Me, akses Anyone, lalu gunakan URL /exec.');
    }
    if ($response['ok'] !== true) {
        $messages = [
            'CONFIG_MISSING' => 'Isi WEBSITE_SHARED_SECRET dan ALLOWED_SPREADSHEET_IDS pada Script Properties GAS.',
            'UNAUTHORIZED' => 'Kunci koneksi GAS tidak cocok dengan kunci di hosting.',
            'SPREADSHEET_NOT_ALLOWED' => 'ID Spreadsheet belum dimasukkan ke ALLOWED_SPREADSHEET_IDS pada GAS.',
            'SPREADSHEET_UNAVAILABLE' => 'Akun Google yang men-deploy GAS belum memiliki akses ke Spreadsheet.',
            'TAB_NOT_FOUND' => 'Tab stok tidak ditemukan di Spreadsheet.',
            'INVALID_HEADER' => 'Kolom A-F harus: id, username, password, status, order_id, buyer_email.',
            'TOO_MANY_ROWS' => 'Maksimal 10.000 akun per tab.',
            'ACCOUNT_NOT_FOUND' => 'ID akun terjual tidak ditemukan di Spreadsheet.',
            'SALE_CONFLICT' => 'Akun di Spreadsheet sudah terkait pesanan lain atau dinonaktifkan.',
            'BUSY' => 'Spreadsheet sedang diproses. Coba lagi beberapa saat.',
            'INVALID_ACTION' => 'Perbarui Code.gs lalu deploy New version untuk mengaktifkan editor Spreadsheet.',
            'INVALID_ROW' => 'Isi username/password dan pilih status tersedia atau nonaktif.',
            'ROW_CHANGED' => 'Baris berubah sejak dimuat. Muat ulang data sebelum mengedit.',
            'DUPLICATE_USERNAME' => 'Email/username tersebut sudah ada pada baris lain.',
        ];
        throw new RuntimeException($messages[$response['code'] ?? ''] ?? 'Permintaan GAS gagal. Periksa deployment dan konfigurasi script.');
    }
    if (!is_array($response['data'] ?? null)) throw new RuntimeException('Format respons GAS tidak valid.');
    return $response['data'];
}

function account_gas_request(string $action, string $spreadsheetId, array $args = []): array
{
    $config = account_gas_config();
    if (!function_exists('curl_init')) throw new RuntimeException('Ekstensi cURL belum aktif di hosting.');
    $payload = json_encode(array_merge($args, ['action' => $action, 'spreadsheetId' => $spreadsheetId, 'secret' => $config['secret']]), JSON_THROW_ON_ERROR);
    $curl = curl_init($config['url']);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 25, CURLOPT_FOLLOWLOCATION => false]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $redirect = (string) curl_getinfo($curl, CURLINFO_REDIRECT_URL);
    curl_close($curl);
    // ContentService redirects to Google-hosted JSON. Follow with GET and never
    // forward the POST body/shared secret to any redirect destination.
    if (in_array($status, [301, 302, 303], true)) {
        if (!account_gas_redirect_allowed($redirect)) throw new RuntimeException('Redirect GAS tidak valid. Pastikan deployment mengizinkan akses Anyone.');
        $curl = curl_init($redirect);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 25, CURLOPT_FOLLOWLOCATION => false]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
    }
    if ($body === false || $status < 200 || $status >= 300) throw new RuntimeException('GAS belum dapat dihubungi. Periksa URL deployment dan coba lagi.');
    return account_gas_result($body);
}
