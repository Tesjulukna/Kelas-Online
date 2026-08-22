<?php
declare(strict_types=1);

require __DIR__ . '/api/_bootstrap.php';
require __DIR__ . '/api/_digital-products-common.php';

function sitemap_escape(string $value): string
{
    return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function sitemap_origin(): string
{
    $forwardedProto = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0] ?? '');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https';
    $scheme = $https ? 'https' : 'http';
    $host = preg_replace('/[^a-z0-9.\-:\[\]]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'ibnucreative.com'));
    return $scheme . '://' . ($host ?: 'ibnucreative.com');
}

function sitemap_public_codes(array $items): array
{
    $taken = [];
    foreach ($items as &$item) {
        $source = (string) ($item['id'] ?? 'item');
        $hash = 0x811c9dc5;
        for ($i = 0, $length = strlen($source); $i < $length; $i++) {
            $hash = ($hash ^ ord($source[$i])) & 0xffffffff;
            $hash = ($hash * 0x01000193) % 0x100000000;
        }
        for ($salt = 0; $salt < 100; $salt++) {
            $code = str_pad((string) (10000 + (($hash + $salt * 9973) % 90000)), 5, '0', STR_PAD_LEFT);
            if (!isset($taken[$code])) {
                $taken[$code] = true;
                $item['publicCode'] = $code;
                break;
            }
        }
    }
    unset($item);
    return $items;
}

$origin = sitemap_origin();
$today = gmdate('Y-m-d');
$urls = [];
$add = static function (string $path, string $lastmod, string $changefreq, string $priority) use (&$urls, $origin): void {
    $urls[] = compact('path', 'lastmod', 'changefreq', 'priority') + ['loc' => $origin . $path];
};

foreach ([
    ['/', 'daily', '1.0'], ['/kelas', 'daily', '0.9'], ['/produk', 'daily', '0.9'],
    ['/prompt', 'daily', '0.9'], ['/tentang-kami', 'monthly', '0.6'],
    ['/kontak-support', 'monthly', '0.5'], ['/kebijakan-privasi', 'yearly', '0.3'],
    ['/ketentuan-layanan', 'yearly', '0.3'],
] as [$path, $frequency, $priority]) {
    $add($path, $today, $frequency, $priority);
}

try {
    $pdo = db();
    $settings = fetch_website_settings($pdo);
    $classes = sitemap_public_codes(array_values(array_filter(fetch_classes($pdo), static fn($item) => ($item['status'] ?? '') === 'Aktif')));
    foreach ($classes as $item) {
        $updated = substr((string) ($item['updatedAt'] ?? $today), 0, 10) ?: $today;
        $add('/kelas/' . rawurlencode((string) ($item['publicCode'] ?? $item['id'])), $updated, 'weekly', '0.8');
    }

    ensure_digital_products_schema($pdo);
    $products = sitemap_public_codes(fetch_digital_products($pdo, null)['digitalProducts'] ?? []);
    foreach ($products as $item) {
        $route = ($item['productType'] ?? '') === 'prompt' ? 'prompt' : 'produk';
        $updated = substr((string) ($item['updatedAt'] ?? $today), 0, 10) ?: $today;
        $add('/' . $route . '/' . rawurlencode((string) ($item['publicCode'] ?? $item['id'])), $updated, 'weekly', '0.8');
    }

    foreach (($settings['bundling']['programs'] ?? []) as $bundle) {
        if (!empty($bundle['active'])) {
            $add('/bundling/' . rawurlencode((string) $bundle['id']), $today, 'weekly', '0.7');
        }
    }
} catch (Throwable $error) {
    // Static URLs remain available when the database is temporarily unavailable.
}

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=1800');
echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
echo "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
foreach ($urls as $url) {
    echo "  <url><loc>" . sitemap_escape($url['loc']) . "</loc><lastmod>" . sitemap_escape($url['lastmod']) . "</lastmod><changefreq>{$url['changefreq']}</changefreq><priority>{$url['priority']}</priority></url>\n";
}
echo "</urlset>\n";
