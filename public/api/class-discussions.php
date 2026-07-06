<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST', 'DELETE']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function discussion_ensure_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS class_discussions (
            id VARCHAR(120) PRIMARY KEY,
            class_id VARCHAR(120) NOT NULL,
            class_title VARCHAR(180) NOT NULL DEFAULT '',
            sender_id VARCHAR(120) NOT NULL DEFAULT '',
            sender_role VARCHAR(40) NOT NULL DEFAULT 'member',
            sender_name VARCHAR(160) NOT NULL DEFAULT '',
            sender_avatar MEDIUMTEXT NULL,
            message MEDIUMTEXT NOT NULL,
            created_at VARCHAR(60) NOT NULL DEFAULT '',
            INDEX class_discussion_class_index (class_id),
            INDEX class_discussion_sender_index (sender_id),
            INDEX class_discussion_created_index (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
}

function discussion_clean_message($value): string
{
    return clean_text($value, 1200);
}

function discussion_public(array $row): array
{
    return [
        'id' => clean_text($row['id'] ?? '', 120),
        'classId' => clean_text($row['class_id'] ?? '', 120),
        'classTitle' => clean_text($row['class_title'] ?? 'Kelas', 180),
        'senderId' => clean_text($row['sender_id'] ?? '', 120),
        'senderRole' => clean_text($row['sender_role'] ?? 'member', 40),
        'senderName' => clean_text($row['sender_name'] ?? 'Member', 160),
        'senderAvatar' => clean_asset_url($row['sender_avatar'] ?? '', 1000),
        'message' => discussion_clean_message($row['message'] ?? ''),
        'createdAt' => clean_text($row['created_at'] ?? '', 60),
    ];
}

function discussion_member_class_ids(PDO $pdo, array $user): array
{
    $query = $pdo->prepare('SELECT allowed_class_ids FROM accounts WHERE id = ? AND role = ? LIMIT 1');
    $query->execute([$user['userId'] ?? '', 'member']);
    $account = $query->fetch();
    $ids = clean_allowed_class_ids($account['allowed_class_ids'] ?? null);

    if (!is_array($ids)) {
        $ids = clean_allowed_class_ids($user['allowedClassIds'] ?? null);
    }

    return is_array($ids) ? $ids : [];
}

function discussion_fetch_messages(PDO $pdo, array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        $rows = $pdo
            ->query('SELECT * FROM class_discussions ORDER BY created_at DESC, id DESC LIMIT 2000')
            ->fetchAll();

        return array_reverse(array_map('discussion_public', $rows));
    }

    $classIds = discussion_member_class_ids($pdo, $user);

    if (!$classIds) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($classIds), '?'));
    $query = $pdo->prepare(
        "SELECT * FROM class_discussions
        WHERE class_id IN ($placeholders)
        ORDER BY created_at DESC, id DESC
        LIMIT 1000",
    );
    $query->execute($classIds);

    return array_reverse(array_map('discussion_public', $query->fetchAll()));
}

discussion_ensure_schema($pdo);

if ($method === 'GET') {
    $user = require_user();

    send_json(200, [
        'classDiscussions' => discussion_fetch_messages($pdo, $user),
        'updatedAt' => updated_at($pdo),
    ]);
}

$payload = read_json_body();

if ($method === 'POST') {
    $user = require_user();
    $classId = clean_text($payload['classId'] ?? '', 120);
    $classTitle = clean_text($payload['classTitle'] ?? 'Kelas', 180);
    $message = discussion_clean_message($payload['message'] ?? '');

    if ($classId === '' || $message === '') {
        send_json(400, ['message' => 'Kelas dan pesan diskusi wajib diisi.']);
    }

    if (($user['role'] ?? '') !== 'admin') {
        $classIds = discussion_member_class_ids($pdo, $user);

        if (!in_array($classId, $classIds, true)) {
            send_json(403, ['message' => 'Kamu belum punya akses diskusi kelas ini.']);
        }
    }

    $classQuery = $pdo->prepare('SELECT title FROM classes WHERE id = ? LIMIT 1');
    $classQuery->execute([$classId]);
    $class = $classQuery->fetch();

    if ($class) {
        $classTitle = clean_text($class['title'] ?? $classTitle, 180);
    }

    $insert = $pdo->prepare(
        'INSERT INTO class_discussions
        (id, class_id, class_title, sender_id, sender_role, sender_name, sender_avatar, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insert->execute([
        make_id('discussion'),
        $classId,
        $classTitle,
        clean_text($user['userId'] ?? '', 120),
        clean_text($user['role'] ?? 'member', 40),
        clean_text($user['name'] ?? (($user['role'] ?? '') === 'admin' ? 'Admin' : 'Member'), 160),
        clean_asset_url($user['avatar'] ?? '', 1000),
        $message,
        date(DATE_ATOM),
    ]);

    send_json(200, [
        'classDiscussions' => discussion_fetch_messages($pdo, $user),
        'updatedAt' => updated_at($pdo),
    ]);
}

$admin = require_user('admin');

$messageId = clean_text($_GET['id'] ?? '', 120);

if ($messageId === '') {
    send_json(400, ['message' => 'ID pesan diskusi wajib dikirim.']);
}

$delete = $pdo->prepare('DELETE FROM class_discussions WHERE id = ?');
$delete->execute([$messageId]);

send_json(200, [
    'classDiscussions' => discussion_fetch_messages($pdo, $admin),
    'updatedAt' => updated_at($pdo),
]);
