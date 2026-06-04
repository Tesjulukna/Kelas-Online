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
                            'prompt' => $asset['prompt'],
                        ];
                    }, $assets),
                ];
            }, $materials),
        ];
    }, $classes);
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
