<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST', 'PUT', 'DELETE']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function cert_json($value): array
{
    $decoded = json_decode((string) ($value ?? '{}'), true);

    return is_array($decoded) ? $decoded : [];
}

function certificate_ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    try {
        $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $query->execute([$column]);

        if (!$query->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD `$column` {$definition}");
        }
    } catch (Throwable $error) {
        // Hosting that blocks runtime ALTER can still be fixed through install.php/schema.sql.
    }
}

function certificate_ensure_runtime_schema(PDO $pdo): void
{
    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS certificate_templates (
                id VARCHAR(120) PRIMARY KEY,
                class_id VARCHAR(120) NOT NULL DEFAULT '',
                name VARCHAR(180) NOT NULL DEFAULT 'Template Sertifikat',
                mentor_name VARCHAR(160) NOT NULL DEFAULT 'Ibnu Creative',
                size_type VARCHAR(60) NOT NULL DEFAULT 'a4Landscape',
                width INT NOT NULL DEFAULT 1123,
                height INT NOT NULL DEFAULT 794,
                payload LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX certificate_template_class_index (class_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS certificates (
                id VARCHAR(120) PRIMARY KEY,
                certificate_id VARCHAR(120) NOT NULL,
                member_id VARCHAR(120) NOT NULL DEFAULT '',
                member_name VARCHAR(160) NOT NULL DEFAULT '',
                class_id VARCHAR(120) NOT NULL DEFAULT '',
                class_title VARCHAR(180) NOT NULL DEFAULT '',
                mentor_name VARCHAR(160) NOT NULL DEFAULT 'Ibnu Creative',
                participant_name VARCHAR(160) NOT NULL DEFAULT '',
                template_id VARCHAR(120) NOT NULL DEFAULT '',
                template_snapshot LONGTEXT,
                completed_at VARCHAR(60) NOT NULL DEFAULT '',
                issued_at VARCHAR(60) NOT NULL DEFAULT '',
                name_change_used TINYINT(1) NOT NULL DEFAULT 0,
                version INT NOT NULL DEFAULT 1,
                revoked_at VARCHAR(60) NOT NULL DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY certificate_public_id_unique (certificate_id),
                UNIQUE KEY certificate_member_class_unique (member_id, class_id),
                INDEX certificate_member_index (member_id),
                INDEX certificate_class_index (class_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS certificate_name_change_requests (
                id VARCHAR(120) PRIMARY KEY,
                certificate_row_id VARCHAR(120) NOT NULL DEFAULT '',
                public_certificate_id VARCHAR(120) NOT NULL DEFAULT '',
                member_id VARCHAR(120) NOT NULL DEFAULT '',
                member_name VARCHAR(160) NOT NULL DEFAULT '',
                class_id VARCHAR(120) NOT NULL DEFAULT '',
                class_title VARCHAR(180) NOT NULL DEFAULT '',
                old_name VARCHAR(160) NOT NULL DEFAULT '',
                new_name VARCHAR(160) NOT NULL DEFAULT '',
                reason TEXT,
                status VARCHAR(40) NOT NULL DEFAULT 'pending',
                admin_note TEXT,
                reviewed_at VARCHAR(60) NOT NULL DEFAULT '',
                created_at VARCHAR(60) NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY certificate_change_once_unique (certificate_row_id),
                INDEX certificate_change_status_index (status),
                INDEX certificate_change_member_index (member_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $error) {
        // The verification endpoint should keep returning JSON even if schema creation fails.
    }

    foreach ([
        'id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'certificate_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'member_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'member_name' => "VARCHAR(160) NOT NULL DEFAULT ''",
        'class_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'class_title' => "VARCHAR(180) NOT NULL DEFAULT ''",
        'mentor_name' => "VARCHAR(160) NOT NULL DEFAULT 'Ibnu Creative'",
        'participant_name' => "VARCHAR(160) NOT NULL DEFAULT ''",
        'template_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'template_snapshot' => 'LONGTEXT NULL',
        'completed_at' => "VARCHAR(60) NOT NULL DEFAULT ''",
        'issued_at' => "VARCHAR(60) NOT NULL DEFAULT ''",
        'name_change_used' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'version' => 'INT NOT NULL DEFAULT 1',
        'revoked_at' => "VARCHAR(60) NOT NULL DEFAULT ''",
        'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ] as $column => $definition) {
        certificate_ensure_column($pdo, 'certificates', $column, $definition);
    }

    foreach ([
        'id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'class_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'name' => "VARCHAR(180) NOT NULL DEFAULT 'Template Sertifikat'",
        'mentor_name' => "VARCHAR(160) NOT NULL DEFAULT 'Ibnu Creative'",
        'size_type' => "VARCHAR(60) NOT NULL DEFAULT 'a4Landscape'",
        'width' => 'INT NOT NULL DEFAULT 1123',
        'height' => 'INT NOT NULL DEFAULT 794',
        'payload' => 'LONGTEXT NULL',
        'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ] as $column => $definition) {
        certificate_ensure_column($pdo, 'certificate_templates', $column, $definition);
    }

    foreach ([
        'id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'certificate_row_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'public_certificate_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'member_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'member_name' => "VARCHAR(160) NOT NULL DEFAULT ''",
        'class_id' => "VARCHAR(120) NOT NULL DEFAULT ''",
        'class_title' => "VARCHAR(180) NOT NULL DEFAULT ''",
        'old_name' => "VARCHAR(160) NOT NULL DEFAULT ''",
        'new_name' => "VARCHAR(160) NOT NULL DEFAULT ''",
        'reason' => 'TEXT NULL',
        'status' => "VARCHAR(40) NOT NULL DEFAULT 'pending'",
        'admin_note' => 'TEXT NULL',
        'reviewed_at' => "VARCHAR(60) NOT NULL DEFAULT ''",
        'created_at' => "VARCHAR(60) NOT NULL DEFAULT ''",
        'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ] as $column => $definition) {
        certificate_ensure_column($pdo, 'certificate_name_change_requests', $column, $definition);
    }
}

function certificate_asset_url($value): string
{
    $url = is_string($value) ? trim($value) : '';

    if ($url === '') {
        return '';
    }

    $needle = '/storage/v1/object/public/';
    $position = strpos($url, $needle);

    if ($position !== false) {
        $path = substr($url, $position + strlen($needle));
        $path = preg_replace('#^ibnu-assets/#', '', ltrim($path, '/')) ?? $path;

        return '/uploads/' . ltrim($path, '/');
    }

    return clean_asset_url($url, 2000);
}

function certificate_normalize_template_payload($payload): array
{
    $template = is_array($payload) ? $payload : [];

    if (isset($template['backgroundImage'])) {
        $template['backgroundImage'] = certificate_asset_url($template['backgroundImage']);
    }

    $elements = is_array($template['elements'] ?? null) ? $template['elements'] : [];
    $template['elements'] = array_map(function ($element): array {
        $nextElement = is_array($element) ? $element : [];

        if (($nextElement['type'] ?? '') === 'image' && isset($nextElement['src'])) {
            $nextElement['src'] = certificate_asset_url($nextElement['src']);
        }

        return $nextElement;
    }, $elements);

    return $template;
}

function certificate_public(array $row): array
{
    return [
        'id' => $row['id'] ?? '',
        'certificateId' => $row['certificate_id'] ?? ($row['certificateId'] ?? ''),
        'memberId' => $row['member_id'] ?? ($row['memberId'] ?? ''),
        'memberName' => $row['member_name'] ?? ($row['memberName'] ?? 'Member'),
        'classId' => $row['class_id'] ?? ($row['classId'] ?? ''),
        'classTitle' => $row['class_title'] ?? ($row['classTitle'] ?? 'Kelas'),
        'mentorName' => $row['mentor_name'] ?? ($row['mentorName'] ?? 'Ibnu Creative'),
        'participantName' => $row['participant_name'] ?? ($row['participantName'] ?? ($row['member_name'] ?? 'Member')),
        'templateId' => $row['template_id'] ?? ($row['templateId'] ?? ''),
        'templateSnapshot' => cert_json($row['template_snapshot'] ?? ($row['templateSnapshot'] ?? '{}')),
        'completedAt' => $row['completed_at'] ?? ($row['completedAt'] ?? ''),
        'issuedAt' => $row['issued_at'] ?? ($row['issuedAt'] ?? ''),
        'nameChangeUsed' => !empty($row['name_change_used']),
        'version' => (int) ($row['version'] ?? 1),
        'revokedAt' => $row['revoked_at'] ?? ($row['revokedAt'] ?? ''),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function certificate_template_public(array $row): array
{
    return [
        'id' => $row['id'] ?? '',
        'classId' => $row['class_id'] ?? '',
        'name' => $row['name'] ?? 'Template Sertifikat',
        'mentorName' => $row['mentor_name'] ?? 'Ibnu Creative',
        'sizeType' => $row['size_type'] ?? 'a4Landscape',
        'width' => (int) ($row['width'] ?? 1123),
        'height' => (int) ($row['height'] ?? 794),
        'payload' => certificate_normalize_template_payload(cert_json($row['payload'] ?? '{}')),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function certificate_change_public(array $row): array
{
    return [
        'id' => $row['id'] ?? '',
        'certificateRowId' => $row['certificate_row_id'] ?? '',
        'publicCertificateId' => $row['public_certificate_id'] ?? '',
        'memberId' => $row['member_id'] ?? '',
        'memberName' => $row['member_name'] ?? 'Member',
        'classId' => $row['class_id'] ?? '',
        'classTitle' => $row['class_title'] ?? 'Kelas',
        'oldName' => $row['old_name'] ?? '',
        'newName' => $row['new_name'] ?? '',
        'reason' => $row['reason'] ?? '',
        'status' => $row['status'] ?? 'pending',
        'adminNote' => $row['admin_note'] ?? '',
        'reviewedAt' => $row['reviewed_at'] ?? '',
        'createdAt' => $row['created_at'] ?? '',
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function fetch_certificates_response(PDO $pdo, array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        $certificateRows = $pdo->query('SELECT * FROM certificates ORDER BY issued_at DESC, created_at DESC')->fetchAll();
        $requestRows = $pdo->query('SELECT * FROM certificate_name_change_requests ORDER BY created_at DESC, id DESC')->fetchAll();
    } else {
        $certificateQuery = $pdo->prepare('SELECT * FROM certificates WHERE member_id = ? ORDER BY issued_at DESC, created_at DESC');
        $certificateQuery->execute([$user['userId'] ?? '']);
        $certificateRows = $certificateQuery->fetchAll();
        $requestQuery = $pdo->prepare('SELECT * FROM certificate_name_change_requests WHERE member_id = ? ORDER BY created_at DESC, id DESC');
        $requestQuery->execute([$user['userId'] ?? '']);
        $requestRows = $requestQuery->fetchAll();
    }

    $templateRows = $pdo->query('SELECT * FROM certificate_templates ORDER BY updated_at DESC, created_at DESC')->fetchAll();

    return [
        'certificates' => array_map('certificate_public', $certificateRows),
        'certificateNameChangeRequests' => array_map('certificate_change_public', $requestRows),
        'certificateTemplates' => array_map('certificate_template_public', $templateRows),
        'updatedAt' => updated_at($pdo),
    ];
}

function certificate_generate_public_id(PDO $pdo): string
{
    for ($i = 0; $i < 20; $i += 1) {
        $code = 'IC-' . date('Y') . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        $query = $pdo->prepare('SELECT id FROM certificates WHERE certificate_id = ? LIMIT 1');
        $query->execute([$code]);

        if (!$query->fetch()) {
            return $code;
        }
    }

    return 'IC-' . date('Y') . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
}

function certificate_normalize_lookup_value($value): string
{
    $text = trim(urldecode((string) ($value ?? '')));
    $text = preg_replace('/[\x00-\x20]+/', '', $text) ?? $text;

    return trim($text, "/ \t\n\r\0\x0B");
}

function certificate_lookup_candidates($value): array
{
    $items = [];
    $raw = (string) ($value ?? '');
    $decoded = urldecode($raw);

    foreach ([$raw, $decoded] as $item) {
        $item = trim((string) $item);

        if ($item === '') {
            continue;
        }

        $items[] = $item;
        $path = parse_url($item, PHP_URL_PATH);

        if (is_string($path) && $path !== '') {
            $items[] = $path;

            if (preg_match('~/sertifikat/([^/?#]+)~i', $path, $matches)) {
                $items[] = $matches[1];
            }

            $basename = basename($path);

            if ($basename !== '' && $basename !== '.' && $basename !== '/') {
                $items[] = $basename;
            }
        }

        if (preg_match('~/sertifikat/([^/?#]+)~i', $item, $matches)) {
            $items[] = $matches[1];
        }

        $queryString = parse_url($item, PHP_URL_QUERY);

        if (is_string($queryString) && $queryString !== '') {
            parse_str($queryString, $query);

            foreach (['verify', 'id', 'certificateId', 'certificate_id'] as $key) {
                if (!empty($query[$key]) && is_scalar($query[$key])) {
                    $items[] = (string) $query[$key];
                }
            }
        }
    }

    $candidates = [];

    foreach ($items as $item) {
        $candidate = certificate_normalize_lookup_value($item);

        if ($candidate === '') {
            continue;
        }

        $candidates[$candidate] = $candidate;
        $upperCandidate = strtoupper($candidate);
        $candidates[$upperCandidate] = $upperCandidate;
    }

    return array_values($candidates);
}

function certificate_find_for_verification(PDO $pdo, array $candidates): ?array
{
    if (!$candidates) {
        return null;
    }

    try {
        $placeholders = implode(',', array_fill(0, count($candidates), '?'));
        $query = $pdo->prepare("SELECT * FROM certificates WHERE certificate_id IN ({$placeholders}) OR id IN ({$placeholders}) LIMIT 1");
        $query->execute(array_merge($candidates, $candidates));
        $certificate = $query->fetch();

        if ($certificate) {
            return $certificate;
        }
    } catch (Throwable $error) {
        // Fall back to scanning recent rows for migrated/camelCase columns.
    }

    $candidateIndex = array_flip(array_map('strtoupper', $candidates));

    try {
        $rows = $pdo->query('SELECT * FROM certificates ORDER BY issued_at DESC, created_at DESC LIMIT 5000')->fetchAll();
    } catch (Throwable $error) {
        try {
            $rows = $pdo->query('SELECT * FROM certificates LIMIT 5000')->fetchAll();
        } catch (Throwable $fallbackError) {
            return null;
        }
    }

    foreach ($rows as $row) {
        foreach ([
            $row['certificate_id'] ?? '',
            $row['certificateId'] ?? '',
            $row['public_certificate_id'] ?? '',
            $row['id'] ?? '',
        ] as $value) {
            foreach (certificate_lookup_candidates($value) as $candidate) {
                if (isset($candidateIndex[strtoupper($candidate)])) {
                    return $row;
                }
            }
        }
    }

    return null;
}

certificate_ensure_runtime_schema($pdo);

if ($method === 'GET' && isset($_GET['verify'])) {
    $certificate = certificate_find_for_verification($pdo, certificate_lookup_candidates($_GET['verify']));

    if (!$certificate || !empty($certificate['revoked_at'])) {
        send_json(404, [
            'valid' => false,
            'message' => 'Sertifikat tidak ditemukan di database hosting atau sudah dicabut.',
        ]);
    }

    send_json(200, [
        'valid' => true,
        'certificate' => certificate_public($certificate),
        'message' => 'Sertifikat valid.',
    ]);
}

$user = require_user();

if ($method === 'GET') {
    send_json(200, fetch_certificates_response($pdo, $user));
}

if ($method === 'DELETE') {
    require_user('admin');
    $templateId = clean_text($_GET['templateId'] ?? '', 120);

    if ($templateId === '') {
        send_json(400, ['message' => 'ID template wajib dikirim.']);
    }

    $delete = $pdo->prepare('DELETE FROM certificate_templates WHERE id = ?');
    $delete->execute([$templateId]);
    send_json(200, fetch_certificates_response($pdo, current_user()));
}

$payload = read_json_body();

if ($method === 'POST') {
    $action = clean_text($payload['action'] ?? '', 60);

    if ($action === 'save_template' || $action === 'duplicate_template') {
        require_user('admin');
        $template = is_array($payload['template'] ?? null) ? $payload['template'] : $payload;
        $templateId = $action === 'duplicate_template'
            ? make_id('template')
            : (clean_text($template['id'] ?? '', 120) ?: make_id('template'));
        $insert = $pdo->prepare(
            'INSERT INTO certificate_templates
            (id, class_id, name, mentor_name, size_type, width, height, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE class_id = VALUES(class_id), name = VALUES(name), mentor_name = VALUES(mentor_name), size_type = VALUES(size_type), width = VALUES(width), height = VALUES(height), payload = VALUES(payload)',
        );
        $templatePayload = certificate_normalize_template_payload($template['payload'] ?? $template);
        $insert->execute([
            $templateId,
            clean_text($template['classId'] ?? '', 120),
            clean_text($template['name'] ?? 'Template Sertifikat', 180),
            clean_text($template['mentorName'] ?? 'Ibnu Creative', 160),
            clean_text($template['sizeType'] ?? 'a4Landscape', 60),
            clean_number($template['width'] ?? 1123, 320, 5000),
            clean_number($template['height'] ?? 794, 320, 5000),
            json_encode($templatePayload, JSON_UNESCAPED_UNICODE),
        ]);

        $query = $pdo->prepare('SELECT * FROM certificate_templates WHERE id = ? LIMIT 1');
        $query->execute([$templateId]);
        $savedTemplate = $query->fetch();
        $response = fetch_certificates_response($pdo, current_user());
        $response['template'] = $savedTemplate ? certificate_template_public($savedTemplate) : null;
        send_json(200, $response);
    }

    if ($action === 'request_name_change') {
        $certificateRowId = clean_text($payload['certificateRowId'] ?? ($payload['certificateId'] ?? ''), 120);
        $newName = clean_text($payload['newName'] ?? '', 160);
        $reason = clean_text($payload['reason'] ?? '', 700);

        if ($certificateRowId === '' || $newName === '' || $reason === '') {
            send_json(400, ['message' => 'Nama baru dan alasan wajib diisi.']);
        }

        $certificateQuery = $pdo->prepare('SELECT * FROM certificates WHERE id = ? AND member_id = ? LIMIT 1');
        $certificateQuery->execute([$certificateRowId, $user['userId'] ?? '']);
        $certificate = $certificateQuery->fetch();

        if (!$certificate || !empty($certificate['name_change_used'])) {
            send_json(403, ['message' => 'Kesempatan ubah nama sertifikat tidak tersedia.']);
        }

        $insert = $pdo->prepare(
            'INSERT INTO certificate_name_change_requests
            (id, certificate_row_id, public_certificate_id, member_id, member_name, class_id, class_title, old_name, new_name, reason, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $insert->execute([
            make_id('cert-change'),
            $certificate['id'],
            $certificate['certificate_id'],
            $certificate['member_id'],
            $certificate['member_name'],
            $certificate['class_id'],
            $certificate['class_title'],
            $certificate['participant_name'],
            $newName,
            $reason,
            'pending',
            date(DATE_ATOM),
        ]);
        $pdo->prepare('UPDATE certificates SET name_change_used = 1 WHERE id = ?')->execute([$certificate['id']]);
        send_json(200, fetch_certificates_response($pdo, $user));
    }

    if ($action !== 'create') {
        send_json(400, ['message' => 'Aksi sertifikat tidak valid.']);
    }

    if (($user['role'] ?? '') !== 'member') {
        send_json(403, ['message' => 'Sertifikat hanya bisa dibuat oleh member.']);
    }

    $classId = clean_text($payload['classId'] ?? '', 120);
    $participantName = clean_text($payload['participantName'] ?? ($payload['name'] ?? ''), 160);

    if ($classId === '' || $participantName === '') {
        send_json(400, ['message' => 'Kelas dan nama sertifikat wajib diisi.']);
    }

    $progressQuery = $pdo->prepare('SELECT * FROM member_progress WHERE member_id = ? AND class_id = ? LIMIT 1');
    $progressQuery->execute([$user['userId'] ?? '', $classId]);
    $progress = $progressQuery->fetch();

    if (!$progress || (int) ($progress['progress_percent'] ?? 0) < 100) {
        send_json(403, ['message' => 'Sertifikat bisa dibuat setelah progress kelas 100%.']);
    }

    $existingQuery = $pdo->prepare('SELECT * FROM certificates WHERE member_id = ? AND class_id = ? LIMIT 1');
    $existingQuery->execute([$user['userId'] ?? '', $classId]);
    $existing = $existingQuery->fetch();

    if ($existing) {
        $response = fetch_certificates_response($pdo, $user);
        $response['certificate'] = certificate_public($existing);
        send_json(200, $response);
    }

    $classQuery = $pdo->prepare('SELECT * FROM classes WHERE id = ? LIMIT 1');
    $classQuery->execute([$classId]);
    $class = $classQuery->fetch();

    if (!$class) {
        send_json(404, ['message' => 'Kelas tidak ditemukan.']);
    }

    $templateQuery = $pdo->prepare('SELECT * FROM certificate_templates WHERE class_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1');
    $templateQuery->execute([$classId]);
    $template = $templateQuery->fetch();
    $certificateId = certificate_generate_public_id($pdo);
    $insert = $pdo->prepare(
        'INSERT INTO certificates
        (id, certificate_id, member_id, member_name, class_id, class_title, mentor_name, participant_name, template_id, template_snapshot, completed_at, issued_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $certificateRowId = make_id('certificate');
    $now = date(DATE_ATOM);
    $insert->execute([
        $certificateRowId,
        $certificateId,
        $user['userId'],
        $user['name'] ?? 'Member',
        $classId,
        $class['title'],
        $template['mentor_name'] ?? ($class['mentor'] ?? 'Ibnu Creative'),
        $participantName,
        $template['id'] ?? '',
        $template ? json_encode(certificate_template_public($template), JSON_UNESCAPED_UNICODE) : '{}',
        $progress['last_activity_at'] ?? $now,
        $now,
    ]);
    $newQuery = $pdo->prepare('SELECT * FROM certificates WHERE id = ? LIMIT 1');
    $newQuery->execute([$certificateRowId]);
    $newCertificate = $newQuery->fetch();
    $response = fetch_certificates_response($pdo, $user);
    $response['certificate'] = $newCertificate ? certificate_public($newCertificate) : null;
    send_json(200, $response);
}

require_user('admin');
$requestId = clean_text($payload['id'] ?? ($payload['requestId'] ?? ''), 120);
$status = clean_text($payload['status'] ?? '', 40);
$adminNote = clean_text($payload['adminNote'] ?? '', 500);

if ($requestId === '' || !in_array($status, ['approved', 'rejected'], true)) {
    send_json(400, ['message' => 'ID request dan status review wajib dikirim.']);
}

$requestQuery = $pdo->prepare('SELECT * FROM certificate_name_change_requests WHERE id = ? LIMIT 1');
$requestQuery->execute([$requestId]);
$request = $requestQuery->fetch();

if (!$request) {
    send_json(404, ['message' => 'Request ubah nama tidak ditemukan.']);
}

if ($status === 'approved') {
    $updateCertificate = $pdo->prepare(
        'UPDATE certificates SET participant_name = ?, version = version + 1 WHERE id = ?',
    );
    $updateCertificate->execute([$request['new_name'], $request['certificate_row_id']]);
}

$updateRequest = $pdo->prepare(
    'UPDATE certificate_name_change_requests SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?',
);
$updateRequest->execute([$status, $adminNote, date(DATE_ATOM), $requestId]);

send_json(200, fetch_certificates_response($pdo, current_user()));
