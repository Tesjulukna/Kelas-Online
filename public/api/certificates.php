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
        'id' => $row['id'],
        'certificateId' => $row['certificate_id'] ?? '',
        'memberId' => $row['member_id'] ?? '',
        'memberName' => $row['member_name'] ?? 'Member',
        'classId' => $row['class_id'] ?? '',
        'classTitle' => $row['class_title'] ?? 'Kelas',
        'mentorName' => $row['mentor_name'] ?? 'Ibnu Creative',
        'participantName' => $row['participant_name'] ?? ($row['member_name'] ?? 'Member'),
        'templateId' => $row['template_id'] ?? '',
        'templateSnapshot' => cert_json($row['template_snapshot'] ?? '{}'),
        'completedAt' => $row['completed_at'] ?? '',
        'issuedAt' => $row['issued_at'] ?? '',
        'nameChangeUsed' => !empty($row['name_change_used']),
        'version' => (int) ($row['version'] ?? 1),
        'revokedAt' => $row['revoked_at'] ?? '',
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function certificate_template_public(array $row): array
{
    return [
        'id' => $row['id'],
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
        'id' => $row['id'],
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

if ($method === 'GET' && isset($_GET['verify'])) {
    $certificateId = clean_text($_GET['verify'], 120);
    $query = $pdo->prepare('SELECT * FROM certificates WHERE certificate_id = ? OR id = ? LIMIT 1');
    $query->execute([$certificateId, $certificateId]);
    $certificate = $query->fetch();

    if (!$certificate || !empty($certificate['revoked_at'])) {
        send_json(404, [
            'valid' => false,
            'message' => 'Sertifikat tidak ditemukan atau sudah dicabut.',
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
