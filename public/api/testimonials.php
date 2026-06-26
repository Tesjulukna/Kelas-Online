<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST', 'PUT', 'DELETE']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function testimonial_public(array $row): array
{
    return [
        'id' => $row['id'],
        'memberId' => $row['member_id'] ?? '',
        'memberName' => $row['member_name'] ?? 'Member',
        'memberAvatar' => $row['member_avatar'] ?? '',
        'classId' => $row['class_id'] ?? '',
        'classTitle' => $row['class_title'] ?? 'Kelas',
        'message' => $row['message'] ?? '',
        'status' => $row['status'] ?? 'pending',
        'createdAt' => $row['created_at'] ?? '',
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function fetch_testimonials(PDO $pdo, ?array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        $query = $pdo->query('SELECT * FROM testimonials ORDER BY created_at DESC, id DESC');
    } elseif (($user['role'] ?? '') === 'member') {
        $query = $pdo->prepare(
            "SELECT * FROM testimonials
            WHERE status = 'approved' OR member_id = ?
            ORDER BY created_at DESC, id DESC",
        );
        $query->execute([$user['userId'] ?? '']);
    } else {
        $query = $pdo->query("SELECT * FROM testimonials WHERE status = 'approved' ORDER BY created_at DESC, id DESC");
    }

    return [
        'testimonials' => array_map('testimonial_public', $query->fetchAll()),
        'updatedAt' => updated_at($pdo),
    ];
}

if ($method === 'GET') {
    send_json(200, fetch_testimonials($pdo, current_user()));
}

if ($method === 'POST') {
    $user = require_user('member');
    $payload = read_json_body();
    $classId = clean_text($payload['classId'] ?? '', 120);
    $message = clean_text($payload['message'] ?? '', 280);

    if ($classId === '' || $message === '') {
        send_json(400, ['message' => 'Kelas dan testimoni wajib diisi.']);
    }

    $classQuery = $pdo->prepare('SELECT title FROM classes WHERE id = ? LIMIT 1');
    $classQuery->execute([$classId]);
    $class = $classQuery->fetch();

    if (!$class) {
        send_json(404, ['message' => 'Kelas tidak ditemukan.']);
    }

    $progressQuery = $pdo->prepare(
        'SELECT progress_percent FROM member_progress WHERE member_id = ? AND class_id = ? LIMIT 1',
    );
    $progressQuery->execute([$user['userId'] ?? '', $classId]);
    $progress = (int) ($progressQuery->fetchColumn() ?: 0);

    if ($progress < 100) {
        send_json(403, ['message' => 'Testimoni bisa dikirim setelah progress kelas 100%.']);
    }

    $upsert = $pdo->prepare(
        'INSERT INTO testimonials
        (id, member_id, member_name, member_avatar, class_id, class_title, message, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE message = VALUES(message), status = VALUES(status)',
    );
    $upsert->execute([
        make_id('testimonial'),
        $user['userId'] ?? '',
        clean_text($user['name'] ?? 'Member', 160),
        clean_asset_url($user['avatar'] ?? ''),
        $classId,
        clean_text($class['title'] ?? 'Kelas', 180),
        $message,
        'pending',
        date(DATE_ATOM),
    ]);

    send_json(200, fetch_testimonials($pdo, $user));
}

if ($method === 'PUT') {
    require_user('admin');
    $payload = read_json_body();
    $id = clean_text($payload['id'] ?? '', 120);
    $status = clean_text($payload['status'] ?? 'pending', 40);

    if ($id === '') {
        send_json(400, ['message' => 'ID testimoni wajib dikirim.']);
    }

    $update = $pdo->prepare('UPDATE testimonials SET status = ? WHERE id = ?');
    $update->execute([$status, $id]);
    send_json(200, fetch_testimonials($pdo, current_user()));
}

require_user('admin');
$id = clean_text($_GET['id'] ?? '', 120);

if ($id === '') {
    send_json(400, ['message' => 'ID testimoni wajib dikirim.']);
}

$delete = $pdo->prepare('DELETE FROM testimonials WHERE id = ?');
$delete->execute([$id]);
send_json(200, fetch_testimonials($pdo, current_user()));

