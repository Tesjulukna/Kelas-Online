<?php

require __DIR__ . '/api/_bootstrap.php';
require __DIR__ . '/api/_digital-products-common.php';

function meta_escape($value): string
{
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function meta_plain_text($value, int $maxLength = 220): string
{
    $text = html_entity_decode(strip_tags((string) ($value ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/', ' ', $text) ?? $text;
    $text = trim($text);

    if ($text === '') {
        return '';
    }

    return function_exists('mb_substr')
        ? mb_substr($text, 0, $maxLength)
        : substr($text, 0, $maxLength);
}

function meta_origin(): string
{
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'ibnucreative.com';

    return $scheme . '://' . $host;
}

function meta_absolute_url($value): string
{
    $url = trim((string) ($value ?? ''));

    if ($url === '') {
        return '';
    }

    if (preg_match('/^https?:\/\//i', $url)) {
        return $url;
    }

    if (strpos($url, '//') === 0) {
        return 'https:' . $url;
    }

    if (strpos($url, '/') === 0) {
        return meta_origin() . $url;
    }

    return meta_origin() . '/' . ltrim($url, '/');
}

function meta_public_code_from_id($id, array &$takenCodes): string
{
    $source = (string) ($id ?: 'item');
    $hash = 0x811c9dc5;
    $length = strlen($source);

    for ($index = 0; $index < $length; $index += 1) {
        $hash = ($hash ^ ord($source[$index])) & 0xffffffff;
        $hash = ($hash * 0x01000193) % 0x100000000;
    }

    for ($salt = 0; $salt < 100; $salt += 1) {
        $code = str_pad((string) (10000 + (($hash + $salt * 9973) % 90000)), 5, '0', STR_PAD_LEFT);

        if (!isset($takenCodes[$code])) {
            $takenCodes[$code] = true;
            return $code;
        }
    }

    return str_pad((string) (10000 + ($hash % 90000)), 5, '0', STR_PAD_LEFT);
}

function meta_with_public_codes(array $items): array
{
    $takenCodes = [];

    return array_map(function (array $item) use (&$takenCodes): array {
        $item['publicCode'] = meta_public_code_from_id($item['id'] ?? '', $takenCodes);
        return $item;
    }, $items);
}

function meta_find_public_item(array $items, string $value): ?array
{
    foreach ($items as $item) {
        if (($item['id'] ?? '') === $value || ($item['publicCode'] ?? '') === $value) {
            return $item;
        }
    }

    return null;
}

function meta_item_price_text(array $item): string
{
    $salePrice = (int) ($item['salePrice'] ?? 0);
    $price = (int) ($item['price'] ?? 0);
    $amount = $salePrice > 0 ? $salePrice : $price;

    if ($amount <= 0) {
        return 'Gratis';
    }

    return 'Rp ' . number_format($amount, 0, ',', '.');
}

function meta_build_payload(): array
{
    $settings = default_website_settings();

    try {
        $pdo = db();
        $settings = fetch_website_settings($pdo);
    } catch (Throwable $error) {
        $pdo = null;
    }

    $siteName = $settings['siteName'] ?? 'Ibnu Creative';
    $siteTitle = $settings['siteTitle'] ?? $siteName;
    $siteDescription = $settings['siteDescription'] ?? ($settings['hero']['description'] ?? '');
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $segments = array_values(array_filter(explode('/', trim($path, '/'))));
    $title = $siteTitle;
    $description = $siteDescription;
    $image = $settings['brandLogo'] ?? '';
    $type = 'website';

    if ($image === '' && !empty($settings['hero']['backgroundImage'])) {
        $image = $settings['hero']['backgroundImage'];
    }

    if (isset($pdo) && $pdo instanceof PDO && count($segments) >= 2) {
        $route = strtolower($segments[0]);
        $publicId = urldecode((string) $segments[1]);

        try {
            if ($route === 'kelas') {
                $classes = meta_with_public_codes(array_values(array_filter(
                    fetch_classes($pdo),
                    fn($class) => ($class['status'] ?? '') === 'Aktif',
                )));
                $course = meta_find_public_item($classes, $publicId);

                if ($course) {
                    $title = ($course['title'] ?? 'Kelas') . ' - ' . $siteName;
                    $description = meta_plain_text($course['description'] ?? '', 180);

                    if ($description === '') {
                        $description = 'Ikuti kelas ' . ($course['title'] ?? 'online') . ' di ' . $siteName . '. ' . meta_item_price_text($course) . '.';
                    }

                    $image = $course['thumbnail'] ?? $image;
                    $type = 'article';
                }
            }

            if ($route === 'produk') {
                ensure_digital_products_schema($pdo);
                $productResponse = fetch_digital_products($pdo, null);
                $products = meta_with_public_codes($productResponse['digitalProducts'] ?? []);
                $product = meta_find_public_item($products, $publicId);

                if ($product) {
                    $title = ($product['title'] ?? 'Produk Digital') . ' - ' . $siteName;
                    $description = meta_plain_text($product['description'] ?? '', 180);

                    if ($description === '') {
                        $description = 'Dapatkan produk digital ' . ($product['title'] ?? 'premium') . ' dari ' . $siteName . '. ' . meta_item_price_text($product) . '.';
                    }

                    $image = $product['thumbnail'] ?? $image;
                    $type = 'product';
                }
            }
        } catch (Throwable $error) {
            // Keep default homepage metadata if detail data cannot be loaded.
        }
    }

    if ($description === '') {
        $description = 'Platform kelas online dan produk digital dari ' . $siteName . '.';
    }

    if ($image === '') {
        $image = '/og-default.png';
    }

    return [
        'title' => meta_plain_text($title, 120) ?: $siteName,
        'description' => meta_plain_text($description, 220),
        'image' => meta_absolute_url($image),
        'url' => meta_origin() . ($_SERVER['REQUEST_URI'] ?? '/'),
        'siteName' => $siteName,
        'type' => $type,
    ];
}

$htmlPath = __DIR__ . '/index.html';
$html = is_file($htmlPath) ? file_get_contents($htmlPath) : '';

if ($html === false || $html === '') {
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><title>Ibnu Creative</title><div id="root"></div>';
    exit;
}

$meta = meta_build_payload();
$metaTags = implode("\n    ", [
    '<meta name="description" content="' . meta_escape($meta['description']) . '" />',
    '<link rel="canonical" href="' . meta_escape($meta['url']) . '" />',
    '<meta property="og:locale" content="id_ID" />',
    '<meta property="og:type" content="' . meta_escape($meta['type']) . '" />',
    '<meta property="og:site_name" content="' . meta_escape($meta['siteName']) . '" />',
    '<meta property="og:title" content="' . meta_escape($meta['title']) . '" />',
    '<meta property="og:description" content="' . meta_escape($meta['description']) . '" />',
    '<meta property="og:image" content="' . meta_escape($meta['image']) . '" />',
    '<meta property="og:image:secure_url" content="' . meta_escape($meta['image']) . '" />',
    '<meta property="og:url" content="' . meta_escape($meta['url']) . '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' . meta_escape($meta['title']) . '" />',
    '<meta name="twitter:description" content="' . meta_escape($meta['description']) . '" />',
    '<meta name="twitter:image" content="' . meta_escape($meta['image']) . '" />',
]);

$html = preg_replace('/<title>.*?<\/title>/is', '<title>' . meta_escape($meta['title']) . '</title>', $html, 1) ?? $html;
$html = preg_replace('/\s*<meta\s+name=["\']description["\'][^>]*>\s*/i', "\n", $html) ?? $html;
$html = str_replace('</head>', "    {$metaTags}\n  </head>", $html);

header('Content-Type: text/html; charset=utf-8');
echo $html;
