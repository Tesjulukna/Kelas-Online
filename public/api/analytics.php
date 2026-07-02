<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function analytics_date_range(): array
{
    $end = clean_text($_GET['endDate'] ?? '', 40);
    $start = clean_text($_GET['startDate'] ?? '', 40);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) {
        $end = date('Y-m-d');
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) {
        $start = date('Y-m-d', strtotime($end . ' -6 days'));
    }

    return [
        'startDate' => $start,
        'endDate' => $end,
        'startSql' => $start . ' 00:00:00',
        'endSql' => $end . ' 23:59:59',
    ];
}

function analytics_source_label(string $referrer): array
{
    $host = strtolower((string) parse_url($referrer, PHP_URL_HOST));

    if ($host === '') {
        return ['direct', 'Direct / Manual'];
    }

    $sources = [
        'instagram' => 'Instagram',
        'facebook' => 'Facebook',
        'tiktok' => 'TikTok',
        'youtube' => 'YouTube',
        'whatsapp' => 'WhatsApp',
        'google' => 'Google',
    ];

    foreach ($sources as $key => $label) {
        if (strpos($host, $key) !== false) {
            return [$key, $label];
        }
    }

    return ['referral', $host];
}

function analytics_is_unknown_label(string $label): bool
{
    $normalized = strtolower(trim($label));

    return $normalized === '' || in_array($normalized, ['tidak diketahui', 'unknown', 'null', '-'], true);
}

function analytics_top(array $rows, string $key, int $limit = 8, bool $skipUnknown = false): array
{
    $counts = [];
    $unknownCount = 0;

    foreach ($rows as $row) {
        $label = $row[$key] ?: 'Tidak diketahui';

        if ($skipUnknown && analytics_is_unknown_label((string) $label)) {
            $unknownCount++;
            continue;
        }

        $counts[$label] = ($counts[$label] ?? 0) + 1;
    }

    arsort($counts);
    $items = [];

    foreach (array_slice($counts, 0, $limit, true) as $label => $count) {
        $items[] = ['label' => $label, 'count' => $count];
    }

    if ($skipUnknown && $unknownCount > 0 && count($items) < $limit) {
        $items[] = ['label' => 'Tidak diketahui', 'count' => $unknownCount];
    }

    return $items;
}

function analytics_build(array $rows, array $range): array
{
    $daily = [];
    $cursor = strtotime($range['startDate']);
    $end = strtotime($range['endDate']);

    while ($cursor <= $end) {
        $dateKey = date('Y-m-d', $cursor);
        $daily[$dateKey] = [
            'dateKey' => $dateKey,
            'views' => 0,
            'clicks' => 0,
            'visitorSet' => [],
        ];
        $cursor = strtotime('+1 day', $cursor);
    }

    $visitorIds = [];
    $sessionIds = [];

    foreach ($rows as $row) {
        $dateKey = substr((string) ($row['created_at'] ?? ''), 0, 10) ?: $range['startDate'];

        if (!isset($daily[$dateKey])) {
            $daily[$dateKey] = [
                'dateKey' => $dateKey,
                'views' => 0,
                'clicks' => 0,
                'visitorSet' => [],
            ];
        }

        if (($row['event_type'] ?? '') === 'click') {
            $daily[$dateKey]['clicks'] += 1;
        } else {
            $daily[$dateKey]['views'] += 1;
        }

        if (!empty($row['visitor_id'])) {
            $visitorIds[$row['visitor_id']] = true;
            $daily[$dateKey]['visitorSet'][$row['visitor_id']] = true;
        }

        if (!empty($row['session_id'])) {
            $sessionIds[$row['session_id']] = true;
        }
    }

    $dailyRows = array_values(array_map(static function (array $item): array {
        return [
            'dateKey' => $item['dateKey'],
            'views' => $item['views'],
            'clicks' => $item['clicks'],
            'visitors' => count($item['visitorSet']),
        ];
    }, $daily));

    return [
        'range' => [
            'startDate' => $range['startDate'],
            'endDate' => $range['endDate'],
        ],
        'totals' => [
            'views' => count(array_filter($rows, static fn(array $row): bool => ($row['event_type'] ?? '') !== 'click')),
            'clicks' => count(array_filter($rows, static fn(array $row): bool => ($row['event_type'] ?? '') === 'click')),
            'visitors' => count($visitorIds),
            'sessions' => count($sessionIds),
        ],
        'daily' => $dailyRows,
        'countries' => analytics_top($rows, 'country', 8, true),
        'regions' => analytics_top($rows, 'region', 8, true),
        'cities' => analytics_top($rows, 'city', 8, true),
        'sources' => analytics_top($rows, 'source_label'),
        'pages' => analytics_top($rows, 'page_title'),
        'clickTargets' => analytics_top($rows, 'target_label'),
        'devices' => analytics_top($rows, 'device_type'),
        'updatedAt' => date(DATE_ATOM),
    ];
}

function analytics_client_ip(): string
{
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
        $_SERVER['HTTP_X_REAL_IP'] ?? '',
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
        $_SERVER['REMOTE_ADDR'] ?? '',
    ];

    foreach ($candidates as $candidate) {
        foreach (explode(',', (string) $candidate) as $ip) {
            $ip = trim($ip);

            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }

    return '';
}

function analytics_location_from_headers(): array
{
    $country = clean_text(
        $_SERVER['HTTP_CF_IPCOUNTRY'] ??
        $_SERVER['HTTP_X_VERCEL_IP_COUNTRY'] ??
        '',
        80
    );
    $region = clean_text(
        $_SERVER['HTTP_X_VERCEL_IP_COUNTRY_REGION'] ??
        $_SERVER['HTTP_X_APPENGINE_REGION'] ??
        '',
        120
    );
    $city = clean_text(
        $_SERVER['HTTP_X_VERCEL_IP_CITY'] ??
        $_SERVER['HTTP_X_APPENGINE_CITY'] ??
        '',
        120
    );

    return [
        'country' => $country,
        'region' => $region,
        'city' => $city,
    ];
}

function analytics_country_from_timezone_language(string $timezone, string $language): string
{
    $timezone = strtolower(trim($timezone));
    $language = strtolower(trim($language));

    if (strpos($timezone, 'jakarta') !== false ||
        strpos($timezone, 'makassar') !== false ||
        strpos($timezone, 'jayapura') !== false ||
        strpos($language, 'id') === 0) {
        return 'Indonesia';
    }

    return '';
}

function analytics_lookup_ip_location(string $ip): array
{
    $emptyLocation = ['country' => '', 'region' => '', 'city' => ''];

    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return $emptyLocation;
    }

    if (!isset($_SESSION['analytics_geo_cache']) || !is_array($_SESSION['analytics_geo_cache'])) {
        $_SESSION['analytics_geo_cache'] = [];
    }

    $cached = $_SESSION['analytics_geo_cache'][$ip] ?? null;

    if (is_array($cached) && (($cached['expires_at'] ?? 0) > time())) {
        return [
            'country' => clean_text($cached['country'] ?? '', 80),
            'region' => clean_text($cached['region'] ?? '', 120),
            'city' => clean_text($cached['city'] ?? '', 120),
        ];
    }

    if (!function_exists('curl_init')) {
        return $emptyLocation;
    }

    $curl = curl_init('https://ipwho.is/' . rawurlencode($ip));

    if (!$curl) {
        return $emptyLocation;
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT_MS => 600,
        CURLOPT_TIMEOUT_MS => 1200,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'IbnuCreative-Analytics/1.0',
    ]);

    $body = curl_exec($curl);
    $statusCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if (!is_string($body) || $body === '' || $statusCode < 200 || $statusCode >= 300) {
        return $emptyLocation;
    }

    $data = json_decode($body, true);

    if (!is_array($data) || empty($data['success'])) {
        return $emptyLocation;
    }

    $location = [
        'country' => clean_text($data['country'] ?? '', 80),
        'region' => clean_text($data['region'] ?? '', 120),
        'city' => clean_text($data['city'] ?? '', 120),
    ];

    $_SESSION['analytics_geo_cache'][$ip] = $location + ['expires_at' => time() + 86400];

    return $location;
}

if ($method === 'POST') {
    $user = current_user();

    if (($user['role'] ?? '') === 'admin') {
        send_json(200, ['ok' => true, 'skipped' => true]);
    }

    $payload = read_json_body();
    $eventType = in_array(($payload['eventType'] ?? $payload['type'] ?? 'view'), ['view', 'click'], true)
        ? ($payload['eventType'] ?? $payload['type'])
        : 'view';
    $referrer = clean_asset_url($payload['referrer'] ?? ($_SERVER['HTTP_REFERER'] ?? ''), 800);
    [$source, $sourceLabel] = analytics_source_label($referrer);
    $ip = clean_text(analytics_client_ip(), 120);
    $userAgent = clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 500);
    $timezone = clean_text($payload['timezone'] ?? '', 80);
    $language = clean_text($payload['language'] ?? '', 80);
    $headerLocation = analytics_location_from_headers();
    $ipLocation = analytics_lookup_ip_location($ip);
    $country = clean_text($payload['country'] ?? '', 80)
        ?: $headerLocation['country']
        ?: $ipLocation['country']
        ?: analytics_country_from_timezone_language($timezone, $language)
        ?: 'Tidak diketahui';
    $region = clean_text($payload['region'] ?? '', 120)
        ?: $headerLocation['region']
        ?: $ipLocation['region']
        ?: 'Tidak diketahui';
    $city = clean_text($payload['city'] ?? '', 120)
        ?: $headerLocation['city']
        ?: $ipLocation['city']
        ?: 'Tidak diketahui';

    try {
        $insert = $pdo->prepare(
            'INSERT INTO analytics_events
            (id, event_type, visitor_id, session_id, member_id, member_role, page_path, page_title, target_type, target_label, target_id, referrer, source, source_label, country, region, city, timezone, language, device_type, browser, user_agent, ip_hash, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $insert->execute([
            make_id('analytics'),
            $eventType,
            clean_text($payload['visitorId'] ?? '', 160),
            clean_text($payload['sessionId'] ?? '', 160),
            ($user['role'] ?? '') === 'member' ? clean_text($user['userId'] ?? '', 120) : '',
            ($user['role'] ?? '') === 'member' ? 'member' : 'public',
            clean_text($payload['pagePath'] ?? '/', 300),
            clean_text($payload['pageTitle'] ?? 'Website', 180),
            clean_text($payload['targetType'] ?? '', 80),
            clean_text($payload['targetLabel'] ?? '', 180),
            clean_text($payload['targetId'] ?? '', 120),
            $referrer,
            $source,
            $sourceLabel,
            $country,
            $region,
            $city,
            $timezone,
            $language,
            clean_text($payload['deviceType'] ?? '', 60) ?: 'Tidak diketahui',
            '',
            $userAgent,
            $ip ? hash('sha256', $ip) : '',
            json_encode(is_array($payload['metadata'] ?? null) ? $payload['metadata'] : [], JSON_UNESCAPED_UNICODE),
        ]);
    } catch (Throwable $error) {
        send_json(200, ['ok' => false, 'message' => 'Analytics belum siap.']);
    }

    send_json(200, ['ok' => true]);
}

require_user('admin');
$range = analytics_date_range();
$query = $pdo->prepare(
    'SELECT * FROM analytics_events WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC LIMIT 10000',
);
$query->execute([$range['startSql'], $range['endSql']]);

send_json(200, [
    'analytics' => analytics_build($query->fetchAll(), $range),
]);
