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
    $forwardedProto = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0] ?? '');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https';
    $scheme = $https ? 'https' : 'http';
    $host = preg_replace('/[^a-z0-9.\-:\[\]]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'ibnucreative.com'));

    return $scheme . '://' . ($host ?: 'ibnucreative.com');
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

function meta_json(array $value): string
{
    return (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
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
    $detailMatched = false;
    $robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    $pageHeading = $siteTitle;
    $pageCopy = $siteDescription;
    $schema = [];
    $fallbackLinks = [];
    $canonicalPath = rtrim($path, '/') ?: '/';
    $route = strtolower((string) ($segments[0] ?? ''));
    $isPrivateRoute = in_array($route, ['admin', 'member', 'login', 'reset-password', 'produk-akses', 'prompt-akses', 'sertifikat'], true)
        || (($segments[2] ?? '') === 'checkout');

    if ($isPrivateRoute) {
        $robots = 'noindex, nofollow, noarchive';
    }

    $staticPages = [
        '' => [$siteTitle, $siteDescription],
        'kelas' => ['Semua Kelas Online - ' . $siteName, 'Jelajahi seluruh kelas online kreatif dengan materi praktik, tugas, dan arahan mentor.'],
        'produk' => ['Produk Digital - ' . $siteName, 'Temukan produk digital praktis untuk mendukung pekerjaan dan bisnis kreatif Anda.'],
        'prompt' => ['Prompt AI - ' . $siteName, 'Temukan prompt AI siap pakai untuk mempercepat pekerjaan dan produksi konten kreatif.'],
        'tentang-kami' => ['Tentang Kami - ' . $siteName, 'Kenali ' . $siteName . ' dan komitmen kami menghadirkan pembelajaran digital yang praktis.'],
        'kontak-support' => ['Kontak dan Dukungan - ' . $siteName, 'Hubungi tim ' . $siteName . ' untuk pertanyaan kelas, produk, pembayaran, dan dukungan akun.'],
        'kebijakan-privasi' => ['Kebijakan Privasi - ' . $siteName, 'Pelajari cara ' . $siteName . ' mengelola dan melindungi data pengguna.'],
        'ketentuan-layanan' => ['Ketentuan Layanan - ' . $siteName, 'Baca ketentuan penggunaan kelas online, produk digital, pembayaran, dan layanan ' . $siteName . '.'],
    ];

    if (count($segments) <= 1 && isset($staticPages[$route])) {
        [$title, $description] = $staticPages[$route];
        $pageHeading = preg_replace('/\s+-\s+.*$/', '', $title) ?: $title;
        $pageCopy = $description;
    }

    if ($image === '' && !empty($settings['hero']['backgroundImage'])) {
        $image = $settings['hero']['backgroundImage'];
    }

    if (isset($pdo) && $pdo instanceof PDO && count($segments) >= 2) {
        $publicId = urldecode((string) $segments[1]);

        try {
            if ($route === 'kelas') {
                $classes = meta_with_public_codes(array_values(array_filter(
                    fetch_classes($pdo),
                    fn($class) => ($class['status'] ?? '') === 'Aktif',
                )));
                $course = meta_find_public_item($classes, $publicId);

                if ($course) {
                    $detailMatched = true;
                    $title = ($course['title'] ?? 'Kelas') . ' - ' . $siteName;
                    $description = meta_plain_text($course['description'] ?? '', 180);

                    if ($description === '') {
                        $description = 'Ikuti kelas ' . ($course['title'] ?? 'online') . ' di ' . $siteName . '. ' . meta_item_price_text($course) . '.';
                    }

                    $image = $course['thumbnail'] ?? $image;
                    $type = 'article';
                    $pageHeading = $course['title'] ?? 'Kelas Online';
                    $pageCopy = $description;
                    $schema[] = [
                        '@context' => 'https://schema.org', '@type' => 'Course',
                        'name' => $course['title'] ?? 'Kelas Online', 'description' => $description,
                        'provider' => ['@type' => 'Organization', 'name' => $siteName, 'url' => meta_origin()],
                        'image' => meta_absolute_url($image),
                        'offers' => ['@type' => 'Offer', 'priceCurrency' => 'IDR', 'price' => max(0, (int) (($course['salePrice'] ?? 0) ?: ($course['price'] ?? 0))), 'availability' => 'https://schema.org/InStock', 'url' => meta_origin() . $canonicalPath],
                    ];
                }
            }

            if ($route === 'produk' || $route === 'prompt') {
                ensure_digital_products_schema($pdo);
                $productResponse = fetch_digital_products($pdo, null);
                $products = meta_with_public_codes($productResponse['digitalProducts'] ?? []);
                $product = meta_find_public_item($products, $publicId);

                if ($product && (($route === 'prompt') === (($product['productType'] ?? '') === 'prompt'))) {
                    $detailMatched = true;
                    $kind = $route === 'prompt' ? 'Prompt AI' : 'Produk Digital';
                    $title = ($product['title'] ?? $kind) . ' - ' . $siteName;
                    $description = meta_plain_text($product['description'] ?? '', 180);

                    if ($description === '') {
                        $description = 'Dapatkan ' . strtolower($kind) . ' ' . ($product['title'] ?? 'premium') . ' dari ' . $siteName . '. ' . meta_item_price_text($product) . '.';
                    }

                    $image = $product['thumbnail'] ?? $image;
                    $type = 'product';
                    $pageHeading = $product['title'] ?? $kind;
                    $pageCopy = $description;
                    $schema[] = [
                        '@context' => 'https://schema.org', '@type' => 'Product',
                        'name' => $product['title'] ?? $kind, 'description' => $description,
                        'image' => meta_absolute_url($image), 'brand' => ['@type' => 'Brand', 'name' => $siteName],
                        'offers' => ['@type' => 'Offer', 'priceCurrency' => 'IDR', 'price' => max(0, (int) (($product['salePrice'] ?? 0) ?: ($product['price'] ?? 0))), 'availability' => 'https://schema.org/InStock', 'url' => meta_origin() . $canonicalPath],
                    ];
                }
            }

            if ($route === 'bundling') {
                $programs = is_array($settings['bundling']['programs'] ?? null)
                    ? $settings['bundling']['programs']
                    : [];
                $bundle = null;

                foreach ($programs as $program) {
                    if (($program['id'] ?? '') === $publicId && !empty($program['active'])) {
                        $bundle = $program;
                        break;
                    }
                }

                if ($bundle) {
                    $detailMatched = true;
                    $title = ($bundle['title'] ?? 'Paket Bundling') . ' - ' . $siteName;
                    $description = meta_plain_text($bundle['description'] ?? '', 180);

                    if ($description === '') {
                        $description = 'Dapatkan paket bundling ' . ($bundle['title'] ?? 'pilihan') . ' dari ' . $siteName . '.';
                    }

                    $image = $bundle['thumbnail'] ?? $image;
                    $type = 'product';
                    $pageHeading = $bundle['title'] ?? 'Paket Bundling';
                    $pageCopy = $description;
                    $bundleSchema = [
                        '@context' => 'https://schema.org', '@type' => 'Product',
                        'name' => $bundle['title'] ?? 'Paket Bundling', 'description' => $description,
                        'image' => meta_absolute_url($image), 'brand' => ['@type' => 'Brand', 'name' => $siteName],
                    ];
                    if (($bundle['priceMode'] ?? '') === 'fixed') {
                        $bundleSchema['offers'] = ['@type' => 'Offer', 'priceCurrency' => 'IDR', 'price' => max(0, (int) ($bundle['fixedPrice'] ?? 0)), 'availability' => 'https://schema.org/InStock', 'url' => meta_origin() . $canonicalPath];
                    }
                    $schema[] = $bundleSchema;
                }
            }
        } catch (Throwable $error) {
            // Keep default homepage metadata if detail data cannot be loaded.
        }
    }

    if (isset($pdo) && $pdo instanceof PDO && count($segments) <= 1 && in_array($route, ['', 'kelas', 'produk', 'prompt'], true)) {
        try {
            if ($route === '' || $route === 'kelas') {
                $classes = meta_with_public_codes(array_values(array_filter(
                    fetch_classes($pdo),
                    static fn($item) => ($item['status'] ?? '') === 'Aktif',
                )));
                foreach ($classes as $course) {
                    $fallbackLinks[] = [
                        'url' => '/kelas/' . rawurlencode((string) ($course['publicCode'] ?? $course['id'])),
                        'label' => $course['title'] ?? 'Kelas Online',
                    ];
                }
            }

            if ($route === '' || $route === 'produk' || $route === 'prompt') {
                ensure_digital_products_schema($pdo);
                $products = meta_with_public_codes(fetch_digital_products($pdo, null)['digitalProducts'] ?? []);
                foreach ($products as $product) {
                    $productRoute = ($product['productType'] ?? '') === 'prompt' ? 'prompt' : 'produk';
                    if ($route !== '' && $route !== $productRoute) continue;
                    $fallbackLinks[] = [
                        'url' => '/' . $productRoute . '/' . rawurlencode((string) ($product['publicCode'] ?? $product['id'])),
                        'label' => $product['title'] ?? ($productRoute === 'prompt' ? 'Prompt AI' : 'Produk Digital'),
                    ];
                }
            }

            if ($route === '') {
                foreach (($settings['bundling']['programs'] ?? []) as $bundle) {
                    if (empty($bundle['active'])) continue;
                    $fallbackLinks[] = [
                        'url' => '/bundling/' . rawurlencode((string) $bundle['id']),
                        'label' => $bundle['title'] ?? 'Paket Bundling',
                    ];
                }
            }
        } catch (Throwable $error) {
            // The basic fallback remains useful if catalog data cannot be loaded.
        }
    }

    if (count($segments) >= 2 && !$isPrivateRoute && in_array($route, ['kelas', 'produk', 'prompt', 'bundling'], true) && !$detailMatched) {
        http_response_code(404);
        $robots = 'noindex, follow';
        $title = 'Halaman tidak ditemukan - ' . $siteName;
        $description = 'Konten yang Anda cari tidak tersedia atau sudah dinonaktifkan.';
        $pageHeading = 'Konten tidak ditemukan';
        $pageCopy = $description;
    }

    $knownTopLevelRoutes = array_merge(array_keys($staticPages), ['admin', 'member', 'login', 'reset-password', 'produk-akses', 'prompt-akses', 'sertifikat', 'bundling']);
    if ($route !== '' && !in_array($route, $knownTopLevelRoutes, true)) {
        http_response_code(404);
        $robots = 'noindex, nofollow';
        $title = 'Halaman tidak ditemukan - ' . $siteName;
        $description = 'Halaman yang Anda cari tidak tersedia.';
        $pageHeading = 'Halaman tidak ditemukan';
        $pageCopy = $description;
    }

    if ($description === '') {
        $description = 'Platform kelas online dan produk digital dari ' . $siteName . '.';
    }

    if ($image === '') {
        $image = '/og-default.png';
    }

    $schema[] = [
        '@context' => 'https://schema.org', '@type' => 'Organization',
        'name' => $siteName, 'url' => meta_origin(), 'logo' => meta_absolute_url(($settings['brandLogo'] ?? '') ?: ($settings['faviconUrl'] ?? '/og-default.png')),
    ];
    $schema[] = [
        '@context' => 'https://schema.org', '@type' => 'WebSite',
        'name' => $siteName, 'url' => meta_origin(), 'inLanguage' => 'id-ID',
    ];

    if (!empty($fallbackLinks)) {
        $schema[] = [
            '@context' => 'https://schema.org', '@type' => 'ItemList',
            'name' => $pageHeading,
            'itemListElement' => array_map(
                static fn(array $link, int $index) => ['@type' => 'ListItem', 'position' => $index + 1, 'name' => $link['label'], 'url' => meta_origin() . $link['url']],
                $fallbackLinks,
                array_keys($fallbackLinks),
            ),
        ];
    }

    if (count($segments) >= 2 && !$isPrivateRoute) {
        $categoryLabels = ['kelas' => 'Kelas', 'produk' => 'Produk Digital', 'prompt' => 'Prompt', 'bundling' => 'Bundling'];
        $schema[] = [
            '@context' => 'https://schema.org', '@type' => 'BreadcrumbList',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Beranda', 'item' => meta_origin() . '/'],
                ['@type' => 'ListItem', 'position' => 2, 'name' => $categoryLabels[$route] ?? ucfirst($route), 'item' => meta_origin() . '/' . $route],
                ['@type' => 'ListItem', 'position' => 3, 'name' => $pageHeading, 'item' => meta_origin() . $canonicalPath],
            ],
        ];
    }

    return [
        'title' => meta_plain_text($title, 120) ?: $siteName,
        'description' => meta_plain_text($description, 220),
        'image' => meta_absolute_url($image),
        'url' => meta_origin() . $canonicalPath,
        'siteName' => $siteName,
        'type' => $type,
        'robots' => $robots,
        'schema' => $schema,
        'heading' => meta_plain_text($pageHeading, 160),
        'copy' => meta_plain_text($pageCopy, 360),
        'fallbackLinks' => $fallbackLinks,
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
    '<meta name="robots" content="' . meta_escape($meta['robots']) . '" />',
    '<link rel="canonical" href="' . meta_escape($meta['url']) . '" />',
    '<meta property="og:locale" content="id_ID" />',
    '<meta property="og:type" content="' . meta_escape($meta['type']) . '" />',
    '<meta property="og:site_name" content="' . meta_escape($meta['siteName']) . '" />',
    '<meta property="og:title" content="' . meta_escape($meta['title']) . '" />',
    '<meta property="og:description" content="' . meta_escape($meta['description']) . '" />',
    '<meta property="og:image" content="' . meta_escape($meta['image']) . '" />',
    '<meta property="og:image:secure_url" content="' . meta_escape($meta['image']) . '" />',
    '<meta property="og:image:alt" content="' . meta_escape($meta['heading']) . '" />',
    '<meta property="og:url" content="' . meta_escape($meta['url']) . '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' . meta_escape($meta['title']) . '" />',
    '<meta name="twitter:description" content="' . meta_escape($meta['description']) . '" />',
    '<meta name="twitter:image" content="' . meta_escape($meta['image']) . '" />',
    '<meta name="twitter:image:alt" content="' . meta_escape($meta['heading']) . '" />',
    ...array_map(static fn(array $schema) => '<script type="application/ld+json">' . meta_json($schema) . '</script>', $meta['schema']),
]);

$html = preg_replace('/<title>.*?<\/title>/is', '<title>' . meta_escape($meta['title']) . '</title>', $html, 1) ?? $html;
$html = preg_replace('/\s*<meta\s+name=["\']description["\'][^>]*>\s*/i', "\n", $html) ?? $html;
$html = str_replace('</head>', "    {$metaTags}\n  </head>", $html);
$fallbackCatalog = '';
if (!empty($meta['fallbackLinks'])) {
    $fallbackCatalog = '<section><h2>Katalog ' . meta_escape($meta['siteName']) . '</h2><ul>';
    foreach ($meta['fallbackLinks'] as $link) {
        $fallbackCatalog .= '<li><a href="' . meta_escape($link['url']) . '">' . meta_escape($link['label']) . '</a></li>';
    }
    $fallbackCatalog .= '</ul></section>';
}
$fallback = '<div id="seo-content" style="padding:24px;font-family:system-ui,sans-serif">'
    . '<header><a href="/">' . meta_escape($meta['siteName']) . '</a></header>'
    . '<main><h1>' . meta_escape($meta['heading']) . '</h1><p>' . meta_escape($meta['copy']) . '</p>'
    . '<nav aria-label="Katalog"><a href="/kelas">Kelas</a> · <a href="/produk">Produk Digital</a> · <a href="/prompt">Prompt</a></nav>'
    . $fallbackCatalog . '</main></div>';
$html = str_replace('<div id="root"></div>', '<div id="root">' . $fallback . '</div>', $html);

header('Content-Type: text/html; charset=utf-8');
echo $html;
