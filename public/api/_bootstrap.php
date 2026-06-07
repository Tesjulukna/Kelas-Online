<?php

declare(strict_types=1);

$secureCookie = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function apply_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
    header(
        "Content-Security-Policy: default-src 'self'; " .
        "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " .
        "img-src 'self' data: blob: https:; media-src 'self' blob: data: https:; " .
        "style-src 'self' 'unsafe-inline'; script-src 'self'; " .
        "connect-src 'self' https:; frame-src https://www.youtube.com https://youtube.com; " .
        "form-action 'self'; upgrade-insecure-requests"
    );

    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
    }
}

apply_security_headers();

function api_config(): array
{
    static $config = null;

    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }

    return $config;
}

function send_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Cache-Control: no-store');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensure_method(array $allowed): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if (!in_array($method, $allowed, true)) {
        send_json(405, ['message' => 'Method tidak diizinkan.']);
    }
}

function read_json_body(): array
{
    $rawBody = file_get_contents('php://input') ?: '';
    $data = json_decode($rawBody, true);

    return is_array($data) ? $data : [];
}

function clean_text($value, int $maxLength = 80): string
{
    $text = trim(strip_tags((string) ($value ?? '')));
    $text = str_replace(['<', '>'], '', $text);

    return substr($text, 0, $maxLength);
}

function clean_rich_html($value, int $maxLength = 6000): string
{
    $html = substr((string) ($value ?? ''), 0, $maxLength);
    $html = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html) ?? '';
    $html = preg_replace('/\son\w+\s*=\s*"[^"]*"/i', '', $html) ?? '';
    $html = preg_replace("/\son\w+\s*=\s*'[^']*'/i", '', $html) ?? '';
    $html = strip_tags($html, '<p><br><strong><b><em><i><ul><ol><li><span><div>');
    $html = preg_replace_callback('/\sstyle\s*=\s*"([^"]*)"/i', function ($matches): string {
        $allowed = [];

        foreach (explode(';', $matches[1]) as $style) {
            $style = trim($style);

            if (preg_match('/^(color|text-align)\s*:/i', $style)) {
                $allowed[] = $style;
            }
        }

        return $allowed ? ' style="' . implode('; ', $allowed) . '"' : '';
    }, $html) ?? '';
    $html = preg_replace("/\sstyle\s*=\s*'[^']*'/i", '', $html) ?? '';

    return $html;
}

function clean_username($value): string
{
    return preg_replace('/[^a-z0-9._-]/', '', strtolower(clean_text($value, 40))) ?? '';
}

function clean_session_token($value): string
{
    return preg_replace('/[^a-f0-9]/i', '', (string) ($value ?? '')) ?? '';
}

function clean_email($value): string
{
    $email = strtolower(clean_text($value, 120));

    return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';
}

function clean_number($value, int $min = 0, int $max = 1000000): int
{
    $number = filter_var($value, FILTER_VALIDATE_INT);

    if ($number === false) {
        return $min;
    }

    return min($max, max($min, $number));
}

function clean_image($value): string
{
    $image = is_string($value) ? $value : '';

    if (
        strpos($image, '/uploads/profiles/') === 0 ||
        strpos($image, '/uploads/tugas/') === 0 ||
        strpos($image, '/uploads/gambar/') === 0
    ) {
        return clean_text($image, 240);
    }

    return substr($image, 0, 11) === 'data:image/' && strlen($image) <= 3000000
        ? $image
        : '';
}

function clean_pdf_file($value): string
{
    $file = is_string($value) ? $value : '';

    if (strpos($file, '/uploads/dokumen/') === 0) {
        return clean_text($file, 240);
    }

    return substr($file, 0, 20) === 'data:application/pdf' && strlen($file) <= 8000000
        ? $file
        : '';
}

function clean_external_url($value): string
{
    $url = clean_text($value, 360);

    if ($url === '') {
        return '';
    }

    if (!preg_match('/^https?:\/\//i', $url)) {
        $url = 'https://' . $url;
    }

    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

    return in_array($scheme, ['http', 'https'], true) ? $url : '';
}

function clean_resource_links($value): array
{
    $links = is_array($value) ? $value : [];
    $cleanLinks = [];

    foreach (array_slice($links, 0, 40) as $index => $link) {
        if (!is_array($link)) {
            continue;
        }

        $url = clean_external_url($link['url'] ?? '');

        if ($url === '') {
            continue;
        }

        $cleanLinks[] = [
            'id' => clean_text($link['id'] ?? 'resource-link-' . ($index + 1), 90),
            'title' => clean_text($link['title'] ?? 'Link ' . ($index + 1), 120),
            'url' => $url,
        ];
    }

    return $cleanLinks;
}

function clean_asset_url($value, int $maxLength = 2000): string
{
    $url = clean_text($value, $maxLength);

    if ($url === '') {
        return '';
    }

    if (
        strpos($url, '/') === 0 &&
        strpos($url, '//') !== 0
    ) {
        return $url;
    }

    if (substr($url, 0, 11) === 'data:image/' && strlen($url) <= 3000000) {
        return $url;
    }

    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

    return in_array($scheme, ['http', 'https'], true) ? $url : '';
}

function default_website_settings(): array
{
    return [
        'siteName' => 'IbnuCreative',
        'siteTitle' => 'IbnuCreative Academy',
        'siteDescription' => 'Platform kelas online kreatif untuk belajar desain, video, konten digital, dan strategi jualan dengan materi praktik serta feedback mentor.',
        'faviconUrl' => '/favicon.svg',
        'brandIcon' => 'spark',
        'brandLogo' => '',
        'header' => [
            'loginLabel' => 'Login',
            'dashboardLabel' => 'Dashboard',
            'navItems' => [
                ['id' => 'home', 'label' => 'Beranda', 'sectionId' => 'home'],
                ['id' => 'courses', 'label' => 'Kelas', 'sectionId' => 'courses'],
                ['id' => 'benefits', 'label' => 'Benefit', 'sectionId' => 'benefits'],
                ['id' => 'schedule', 'label' => 'Jadwal', 'sectionId' => 'schedule'],
            ],
        ],
        'hero' => [
            'eyebrow' => 'Platform kelas online kreatif',
            'title' => 'Kelas online untuk menaikkan skillmu.',
            'description' => 'Belajar desain, video editing, konten digital, hingga strategi jualan online lewat materi yang rapi, tugas praktik, feedback mentor, dan dashboard belajar yang nyaman dipakai di semua perangkat.',
            'primaryButton' => 'Mulai Belajar',
            'dashboardButton' => 'Buka Dashboard',
            'secondaryButton' => 'Lihat Kelas',
            'backgroundImage' => '',
        ],
        'stats' => [
            ['icon' => 'users', 'value' => '3.200+', 'label' => 'member aktif'],
            ['icon' => 'bookOpen', 'value' => '12', 'label' => 'kelas dan workshop'],
            ['icon' => 'checkCircle', 'value' => '92%', 'label' => 'praktik sampai selesai'],
        ],
        'courses' => [
            'eyebrow' => 'Pilihan kelas',
            'title' => 'Daftar Kelas',
            'fallbackMentor' => 'Ibnu Creative',
            'fallbackPrice' => 'Mulai dari kelas pilihan',
            'emptyPrice' => 'Harga tersedia di dashboard',
        ],
        'benefits' => [
            'eyebrow' => 'Benefit',
            'title' => 'Belajar lebih terarah dengan materi, tugas, dan feedback mentor.',
            'items' => [
                [
                    'title' => 'Materi pendek dan fokus',
                    'description' => 'Setiap modul dibuat ringkas agar mudah dipraktikkan.',
                    'icon' => 'target',
                ],
                [
                    'title' => 'Feedback mentor',
                    'description' => 'Tugas member direview supaya hasilnya naik bertahap.',
                    'icon' => 'message',
                ],
                [
                    'title' => 'Sertifikat proyek',
                    'description' => 'Kumpulkan portofolio yang bisa dipakai untuk klien.',
                    'icon' => 'certificate',
                ],
            ],
        ],
        'schedule' => [
            'eyebrow' => 'Alur belajar',
            'title' => 'Pilih kelas, ikuti materi, kirim tugas, lalu dapatkan arahan.',
            'description' => 'Semua proses belajar bisa dipantau dari dashboard member. Admin dan mentor dapat mengelola materi, tugas, serta balasan bantuan dari dashboard yang sama.',
            'dashboardButton' => 'Masuk Dashboard',
            'loginButton' => 'Login Member',
            'steps' => [
                ['icon' => 'play', 'label' => 'Langkah 01', 'title' => 'Pilih kelas favorit'],
                ['icon' => 'fileText', 'label' => 'Langkah 02', 'title' => 'Kerjakan tugas praktik'],
                ['icon' => 'message', 'label' => 'Langkah 03', 'title' => 'Terima feedback mentor'],
            ],
        ],
        'footer' => [
            'description' => 'Platform kelas online kreatif untuk belajar desain, video, konten digital, dan strategi jualan dengan materi praktik serta feedback mentor.',
            'copyright' => 'IbnuCreative Academy',
            'bottomText' => 'Kelas online kreatif untuk skill yang langsung dipraktikkan.',
            'socialLinks' => [
                ['id' => 'instagram', 'label' => 'Instagram', 'icon' => 'instagram', 'url' => 'https://instagram.com/'],
                ['id' => 'youtube', 'label' => 'YouTube', 'icon' => 'youtube', 'url' => 'https://youtube.com/'],
                ['id' => 'tiktok', 'label' => 'TikTok', 'icon' => 'video', 'url' => 'https://tiktok.com/'],
                ['id' => 'whatsapp', 'label' => 'WhatsApp', 'icon' => 'message', 'url' => 'https://wa.me/'],
                ['id' => 'telegram', 'label' => 'Telegram', 'icon' => 'send', 'url' => 'https://t.me/'],
            ],
            'contactItems' => [
                ['icon' => 'message', 'text' => 'Bantuan mentor tersedia dari dashboard member.'],
                ['icon' => 'shield', 'text' => 'Materi dan progres belajar tersimpan aman.'],
            ],
            'links' => [
                ['label' => 'Kelas', 'sectionId' => 'courses'],
                ['label' => 'Benefit', 'sectionId' => 'benefits'],
                ['label' => 'Alur belajar', 'sectionId' => 'schedule'],
            ],
        ],
    ];
}

function clean_website_icon($value, string $fallback = 'spark'): string
{
    $icon = clean_text($value, 40);
    $allowed = [
        'spark',
        'bookOpen',
        'video',
        'layoutDashboard',
        'megaphone',
        'target',
        'certificate',
        'message',
        'shield',
        'users',
        'wallet',
        'trendingUp',
        'play',
        'fileText',
        'instagram',
        'youtube',
        'send',
        'checkCircle',
    ];

    return in_array($icon, $allowed, true) ? $icon : $fallback;
}

function clean_website_settings($value): array
{
    $source = is_array($value) ? $value : [];
    $defaults = default_website_settings();
    $header = is_array($source['header'] ?? null) ? $source['header'] : [];
    $hero = is_array($source['hero'] ?? null) ? $source['hero'] : [];
    $courses = is_array($source['courses'] ?? null) ? $source['courses'] : [];
    $benefits = is_array($source['benefits'] ?? null) ? $source['benefits'] : [];
    $schedule = is_array($source['schedule'] ?? null) ? $source['schedule'] : [];
    $footer = is_array($source['footer'] ?? null) ? $source['footer'] : [];

    $navItems = [];
    $sourceNavItems = is_array($header['navItems'] ?? null) ? $header['navItems'] : [];

    foreach ($defaults['header']['navItems'] as $index => $item) {
        $sourceItem = $sourceNavItems[$index] ?? [];
        $navItems[] = [
            'id' => $item['id'],
            'label' => clean_text($sourceItem['label'] ?? $item['label'], 40),
            'sectionId' => $item['sectionId'],
        ];
    }

    $stats = [];
    $sourceStats = is_array($source['stats'] ?? null) ? $source['stats'] : $defaults['stats'];

    foreach (array_slice($sourceStats, 0, 6) as $index => $item) {
        $fallback = $defaults['stats'][$index] ?? $defaults['stats'][0];
        $stats[] = [
            'icon' => clean_website_icon($item['icon'] ?? '', $fallback['icon']),
            'value' => clean_text($item['value'] ?? $fallback['value'], 30),
            'label' => clean_text($item['label'] ?? $fallback['label'], 60),
        ];
    }

    $benefitItems = [];
    $sourceBenefitItems = is_array($benefits['items'] ?? null)
        ? $benefits['items']
        : $defaults['benefits']['items'];

    foreach (array_slice($sourceBenefitItems, 0, 8) as $index => $item) {
        $fallback = $defaults['benefits']['items'][$index] ?? $defaults['benefits']['items'][0];
        $benefitItems[] = [
            'title' => clean_text($item['title'] ?? $fallback['title'], 90),
            'description' => clean_text($item['description'] ?? $fallback['description'], 220),
            'icon' => clean_website_icon($item['icon'] ?? '', $fallback['icon']),
        ];
    }

    $steps = [];
    $sourceSteps = is_array($schedule['steps'] ?? null)
        ? $schedule['steps']
        : $defaults['schedule']['steps'];

    foreach (array_slice($sourceSteps, 0, 6) as $index => $item) {
        $fallback = $defaults['schedule']['steps'][$index] ?? $defaults['schedule']['steps'][0];
        $steps[] = [
            'icon' => clean_website_icon($item['icon'] ?? '', $fallback['icon']),
            'label' => clean_text($item['label'] ?? $fallback['label'], 40),
            'title' => clean_text($item['title'] ?? $fallback['title'], 90),
        ];
    }

    $socialLinks = [];
    $sourceSocialLinks = is_array($footer['socialLinks'] ?? null)
        ? $footer['socialLinks']
        : $defaults['footer']['socialLinks'];

    foreach (array_slice($sourceSocialLinks, 0, 8) as $index => $item) {
        $fallback = $defaults['footer']['socialLinks'][$index] ?? $defaults['footer']['socialLinks'][0];
        $socialLinks[] = [
            'id' => clean_text($item['id'] ?? $fallback['id'], 40),
            'label' => clean_text($item['label'] ?? $fallback['label'], 50),
            'icon' => clean_website_icon($item['icon'] ?? '', $fallback['icon']),
            'url' => clean_asset_url($item['url'] ?? $fallback['url'], 360),
        ];
    }

    $contactItems = [];
    $sourceContactItems = is_array($footer['contactItems'] ?? null)
        ? $footer['contactItems']
        : $defaults['footer']['contactItems'];

    foreach (array_slice($sourceContactItems, 0, 6) as $index => $item) {
        $fallback = $defaults['footer']['contactItems'][$index] ?? $defaults['footer']['contactItems'][0];
        $contactItems[] = [
            'icon' => clean_website_icon($item['icon'] ?? '', $fallback['icon']),
            'text' => clean_text($item['text'] ?? $fallback['text'], 180),
        ];
    }

    $footerLinks = [];
    $sourceFooterLinks = is_array($footer['links'] ?? null) ? $footer['links'] : [];

    foreach ($defaults['footer']['links'] as $index => $item) {
        $sourceItem = $sourceFooterLinks[$index] ?? [];
        $footerLinks[] = [
            'label' => clean_text($sourceItem['label'] ?? $item['label'], 40),
            'sectionId' => $item['sectionId'],
        ];
    }

    return [
        'siteName' => clean_text($source['siteName'] ?? $defaults['siteName'], 60),
        'siteTitle' => clean_text($source['siteTitle'] ?? $defaults['siteTitle'], 90),
        'siteDescription' => clean_text($source['siteDescription'] ?? $defaults['siteDescription'], 220),
        'faviconUrl' => clean_asset_url($source['faviconUrl'] ?? $defaults['faviconUrl']),
        'brandIcon' => clean_website_icon($source['brandIcon'] ?? '', $defaults['brandIcon']),
        'brandLogo' => clean_asset_url($source['brandLogo'] ?? ''),
        'header' => [
            'loginLabel' => clean_text($header['loginLabel'] ?? $defaults['header']['loginLabel'], 30),
            'dashboardLabel' => clean_text($header['dashboardLabel'] ?? $defaults['header']['dashboardLabel'], 30),
            'navItems' => $navItems,
        ],
        'hero' => [
            'eyebrow' => clean_text($hero['eyebrow'] ?? $defaults['hero']['eyebrow'], 80),
            'title' => clean_text($hero['title'] ?? $defaults['hero']['title'], 120),
            'description' => clean_text($hero['description'] ?? $defaults['hero']['description'], 320),
            'primaryButton' => clean_text($hero['primaryButton'] ?? $defaults['hero']['primaryButton'], 40),
            'dashboardButton' => clean_text($hero['dashboardButton'] ?? $defaults['hero']['dashboardButton'], 40),
            'secondaryButton' => clean_text($hero['secondaryButton'] ?? $defaults['hero']['secondaryButton'], 40),
            'backgroundImage' => clean_asset_url($hero['backgroundImage'] ?? ''),
        ],
        'stats' => $stats,
        'courses' => [
            'eyebrow' => clean_text($courses['eyebrow'] ?? $defaults['courses']['eyebrow'], 60),
            'title' => clean_text($courses['title'] ?? $defaults['courses']['title'], 90),
            'fallbackMentor' => clean_text($courses['fallbackMentor'] ?? $defaults['courses']['fallbackMentor'], 80),
            'fallbackPrice' => clean_text($courses['fallbackPrice'] ?? $defaults['courses']['fallbackPrice'], 90),
            'emptyPrice' => clean_text($courses['emptyPrice'] ?? $defaults['courses']['emptyPrice'], 90),
        ],
        'benefits' => [
            'eyebrow' => clean_text($benefits['eyebrow'] ?? $defaults['benefits']['eyebrow'], 60),
            'title' => clean_text($benefits['title'] ?? $defaults['benefits']['title'], 140),
            'items' => $benefitItems,
        ],
        'schedule' => [
            'eyebrow' => clean_text($schedule['eyebrow'] ?? $defaults['schedule']['eyebrow'], 60),
            'title' => clean_text($schedule['title'] ?? $defaults['schedule']['title'], 140),
            'description' => clean_text($schedule['description'] ?? $defaults['schedule']['description'], 280),
            'dashboardButton' => clean_text($schedule['dashboardButton'] ?? $defaults['schedule']['dashboardButton'], 40),
            'loginButton' => clean_text($schedule['loginButton'] ?? $defaults['schedule']['loginButton'], 40),
            'steps' => $steps,
        ],
        'footer' => [
            'description' => clean_text($footer['description'] ?? $defaults['footer']['description'], 260),
            'copyright' => clean_text($footer['copyright'] ?? $defaults['footer']['copyright'], 80),
            'bottomText' => clean_text($footer['bottomText'] ?? $defaults['footer']['bottomText'], 120),
            'socialLinks' => $socialLinks,
            'contactItems' => $contactItems,
            'links' => $footerLinks,
        ],
    ];
}

function clean_allowed_class_ids($value): ?array
{
    if ($value === null || $value === '') {
        return null;
    }

    $ids = is_string($value) ? json_decode($value, true) : $value;

    if (!is_array($ids)) {
        return null;
    }

    return array_values(array_filter(array_map(function ($id): string {
        return clean_text($id, 120);
    }, $ids)));
}

function clean_youtube_url($value): string
{
    $url = clean_text($value, 260);

    if ($url === '') {
        return '';
    }

    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    $host = preg_replace('/^www\./', '', $host) ?? $host;
    $allowedHosts = ['youtube.com', 'm.youtube.com', 'youtu.be'];

    return in_array($host, $allowedHosts, true) ? $url : '';
}

function clean_video_file($value): string
{
    $file = basename(clean_text($value, 180));

    return preg_match('/^[a-zA-Z0-9._-]+\.(mp4|webm|ogg|mov|m4v)$/', $file)
        ? $file
        : '';
}

function clean_video_type($value): string
{
    $type = clean_text($value, 80);
    $allowedTypes = [
        'video/mp4',
        'video/webm',
        'video/ogg',
        'video/quicktime',
        'video/x-m4v',
    ];

    return in_array($type, $allowedTypes, true) ? $type : '';
}

function ensure_video_upload_dir(): string
{
    $publicDir = dirname(__DIR__);
    $uploadsDir = $publicDir . DIRECTORY_SEPARATOR . 'uploads';
    $videoDir = $uploadsDir . DIRECTORY_SEPARATOR . 'videos';

    foreach ([$uploadsDir, $videoDir] as $dir) {
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            send_json(500, ['message' => 'Folder upload video tidak bisa dibuat di hosting.']);
        }
    }

    $rootHtaccess = $uploadsDir . DIRECTORY_SEPARATOR . '.htaccess';
    $videoHtaccess = $videoDir . DIRECTORY_SEPARATOR . '.htaccess';

    if (!is_file($rootHtaccess)) {
        @file_put_contents($rootHtaccess, "Options -Indexes\n");
    }

    if (!is_file($videoHtaccess)) {
        @file_put_contents(
            $videoHtaccess,
            "Options -Indexes\n\n<FilesMatch \"\\.(mp4|webm|ogg|mov|m4v)$\">\n  Require all denied\n</FilesMatch>\n",
        );
    }

    if (!is_writable($videoDir)) {
        send_json(500, ['message' => 'Folder uploads/videos belum bisa ditulis hosting.']);
    }

    return $videoDir;
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = api_config();
    $missingConfig = strpos($config['db_host'] ?? '', 'XXX') !== false ||
        strpos($config['db_name'] ?? '', 'XXXX') !== false ||
        strpos($config['db_user'] ?? '', 'XXXX') !== false ||
        ($config['db_pass'] ?? '') === 'ISI_PASSWORD_DATABASE';

    if ($missingConfig) {
        send_json(500, [
            'message' => 'Konfigurasi database belum diisi di public/api/config.php.',
        ]);
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name'],
    );

    try {
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (Throwable $error) {
        send_json(500, ['message' => 'Koneksi database gagal.']);
    }

    return $pdo;
}

function make_id(string $prefix): string
{
    try {
        return $prefix . '-' . time() . '-' . bin2hex(random_bytes(4));
    } catch (Throwable $error) {
        return $prefix . '-' . uniqid('', true);
    }
}

function hash_password_value(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function verify_password_value(string $password, string $hash): bool
{
    if (password_get_info($hash)['algo'] !== 0) {
        return password_verify($password, $hash);
    }

    $legacyHash = hash('sha256', 'ibnucreative:' . $password);

    return hash_equals($hash, $legacyHash);
}

function session_payload_from_account(array $account, string $token = ''): array
{
    return [
        'userId' => $account['id'],
        'name' => $account['name'],
        'username' => $account['username'],
        'role' => $account['role'],
        'avatar' => $account['avatar'] ?? '',
        'allowedClassIds' => ($account['role'] ?? '') === 'member'
            ? clean_allowed_class_ids($account['allowed_class_ids'] ?? null)
            : null,
        'token' => $token,
        'signedInAt' => date(DATE_ATOM),
    ];
}

function request_session_token(): string
{
    $headerToken = clean_session_token($_SERVER['HTTP_X_SESSION_TOKEN'] ?? '');
    $authHeader = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');

    if ($headerToken !== '') {
        return $headerToken;
    }

    if (is_query_session_token_allowed()) {
        $queryToken = clean_session_token($_GET['token'] ?? '');

        if ($queryToken !== '') {
            return $queryToken;
        }
    }

    if (stripos($authHeader, 'Bearer ') === 0) {
        return clean_session_token(substr($authHeader, 7));
    }

    return '';
}

function is_query_session_token_allowed(): bool
{
    $path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);

    return preg_match('#/(api/)?video(?:\.php)?$#', $path) === 1;
}

function current_user(): ?array
{
    $token = request_session_token();

    if ($token !== '') {
        try {
            $pdo = db();
            $query = $pdo->prepare(
                'SELECT accounts.*
                FROM auth_sessions
                INNER JOIN accounts
                    ON accounts.id = auth_sessions.account_id
                    AND accounts.role = auth_sessions.role
                WHERE auth_sessions.token_hash = ?
                    AND auth_sessions.expires_at > NOW()
                    AND accounts.status = ?
                LIMIT 1',
            );
            $query->execute([hash('sha256', $token), 'Aktif']);
            $account = $query->fetch();

            if ($account) {
                $touch = $pdo->prepare(
                    'UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = ?',
                );
                $touch->execute([hash('sha256', $token)]);

                return session_payload_from_account($account, $token);
            }
        } catch (Throwable $error) {
            // If the token table has not been installed yet, fall back to PHP session.
        }
    }

    if (isset($_SESSION['user']) && is_array($_SESSION['user'])) {
        return $_SESSION['user'];
    }

    return null;
}

function require_user(?string $role = null): array
{
    $user = current_user();

    if (!$user) {
        send_json(401, ['message' => 'Silakan login dulu.']);
    }

    if ($role !== null && ($user['role'] ?? '') !== $role) {
        send_json(403, ['message' => 'Akses tidak diizinkan.']);
    }

    return $user;
}

function public_account(array $account): array
{
    unset($account['password_hash']);

    return [
        'id' => $account['id'],
        'name' => $account['name'],
        'username' => $account['username'],
        'email' => $account['email'],
        'status' => $account['status'],
        'avatar' => $account['avatar'] ?? '',
        'allowedClassIds' => clean_allowed_class_ids($account['allowed_class_ids'] ?? null),
        'joinedAt' => $account['joined_at'],
    ];
}

function fetch_classes(PDO $pdo): array
{
    $classes = $pdo
        ->query('SELECT * FROM classes ORDER BY updated_at DESC, id ASC')
        ->fetchAll();
    $materialsQuery = $pdo->prepare(
        'SELECT * FROM materials WHERE class_id = ? ORDER BY sort_order ASC, id ASC',
    );
    $assetsQuery = $pdo->prepare(
        'SELECT * FROM material_assets WHERE material_id = ? ORDER BY sort_order ASC, id ASC',
    );

    return array_map(function (array $class) use ($materialsQuery, $assetsQuery): array {
        $materialsQuery->execute([$class['id']]);
        $materials = $materialsQuery->fetchAll();

        return [
            'id' => $class['id'],
            'title' => $class['title'],
            'students' => (int) $class['students'],
            'status' => $class['status'],
            'revenue' => $class['revenue'],
            'lynkProductKey' => $class['lynk_product_key'] ?? '',
            'thumbnail' => $class['thumbnail'],
            'mentor' => $class['mentor'],
            'progress' => (int) $class['progress'],
            'next' => $class['next_label'],
            'liveAt' => $class['live_at'],
            'lessons' => $class['lessons'],
            'materials' => array_map(function (array $material) use ($assetsQuery): array {
                $assetsQuery->execute([$material['id']]);
                $assets = $assetsQuery->fetchAll();

                return [
                    'id' => $material['id'],
                    'title' => $material['title'],
                    'description' => $material['description'] ?? '',
                    'videoUrl' => $material['video_url'],
                    'videoFile' => $material['video_file'] ?? '',
                    'videoName' => $material['video_name'] ?? '',
                    'videoType' => $material['video_type'] ?? '',
                    'imageFile' => $material['image_file'] ?? '',
                    'imageName' => $material['image_name'] ?? '',
                    'pdfFile' => $material['pdf_file'] ?? '',
                    'pdfName' => $material['pdf_name'] ?? '',
                    'resourceLinks' => json_decode((string) ($material['resource_links'] ?? '[]'), true) ?: [],
                    'requiresTask' => (bool) $material['requires_task'],
                    'allowTaskImage' => array_key_exists('allow_task_image', $material)
                        ? (bool) $material['allow_task_image']
                        : true,
                    'requireTaskImage' => !empty($material['require_task_image']),
                    'taskPrompt' => $material['task_prompt'],
                    'promptItems' => array_map(function (array $asset): array {
                        return [
                            'id' => $asset['id'],
                            'title' => $asset['title'],
                            'image' => $asset['image'],
                            'instruction' => $asset['instruction'] ?? '',
                            'prompt' => $asset['prompt'],
                        ];
                    }, $assets),
                ];
            }, $materials),
        ];
    }, $classes);
}

function ensure_site_settings_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS site_settings (
                id VARCHAR(60) PRIMARY KEY,
                payload LONGTEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        );
    } catch (Throwable $error) {
        // Installer can create the table if runtime CREATE is blocked.
    }
}

function fetch_website_settings(PDO $pdo): array
{
    ensure_site_settings_table($pdo);

    try {
        $query = $pdo->prepare('SELECT payload FROM site_settings WHERE id = ? LIMIT 1');
        $query->execute(['main']);
        $payload = $query->fetchColumn();
        $settings = $payload ? json_decode((string) $payload, true) : [];

        return clean_website_settings(is_array($settings) ? $settings : []);
    } catch (Throwable $error) {
        return default_website_settings();
    }
}

function save_website_settings(PDO $pdo, array $settings): array
{
    ensure_site_settings_table($pdo);

    $cleanSettings = clean_website_settings($settings);
    $payload = json_encode($cleanSettings, JSON_UNESCAPED_UNICODE);
    $query = $pdo->prepare(
        'INSERT INTO site_settings (id, payload)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
    );
    $query->execute(['main', $payload]);

    return $cleanSettings;
}

function updated_at(PDO $pdo): string
{
    $queries = [
        'SELECT MAX(updated_at) FROM classes',
        'SELECT MAX(updated_at) FROM materials',
        'SELECT MAX(updated_at) FROM material_assets',
        'SELECT MAX(updated_at) FROM accounts',
        'SELECT MAX(updated_at) FROM support_tickets',
        'SELECT MAX(updated_at) FROM submissions',
        'SELECT MAX(updated_at) FROM member_progress',
        'SELECT MAX(last_seen_at) FROM auth_sessions',
        'SELECT MAX(updated_at) FROM site_settings',
    ];
    $times = [];

    foreach ($queries as $query) {
        try {
            $value = $pdo->query($query)->fetchColumn();
        } catch (Throwable $error) {
            $value = null;
        }

        if ($value) {
            $times[] = strtotime((string) $value);
        }
    }

    return $times ? date(DATE_ATOM, max($times)) : date(DATE_ATOM);
}
