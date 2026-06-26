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

function analytics_top(array $rows, string $key, int $limit = 8): array
{
    $counts = [];

    foreach ($rows as $row) {
        $label = $row[$key] ?: 'Tidak diketahui';
        $counts[$label] = ($counts[$label] ?? 0) + 1;
    }

    arsort($counts);
    $items = [];

    foreach (array_slice($counts, 0, $limit, true) as $label => $count) {
        $items[] = ['label' => $label, 'count' => $count];
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
        'countries' => analytics_top($rows, 'country'),
        'regions' => analytics_top($rows, 'region'),
        'cities' => analytics_top($rows, 'city'),
        'sources' => analytics_top($rows, 'source_label'),
        'pages' => analytics_top($rows, 'page_title'),
        'clickTargets' => analytics_top($rows, 'target_label'),
        'devices' => analytics_top($rows, 'device_type'),
        'updatedAt' => date(DATE_ATOM),
    ];
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
    $ip = clean_text($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '', 120);
    $userAgent = clean_text($_SERVER['HTTP_USER_AGENT'] ?? '', 500);

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
            clean_text($payload['country'] ?? 'Tidak diketahui', 80),
            clean_text($payload['region'] ?? 'Tidak diketahui', 120),
            clean_text($payload['city'] ?? 'Tidak diketahui', 120),
            clean_text($payload['timezone'] ?? '', 80),
            clean_text($payload['language'] ?? '', 80),
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

