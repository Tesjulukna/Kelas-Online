<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST', 'PUT', 'DELETE']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function member_api_datetime($value): string
{
    if (!$value) {
        return '';
    }

    $time = strtotime((string) $value);

    return $time ? date(DATE_ATOM, $time) : clean_text($value, 80);
}

function ensure_member_access_column(PDO $pdo): void
{
    try {
        $query = $pdo->prepare('SHOW COLUMNS FROM accounts LIKE ?');
        $query->execute(['allowed_class_ids']);

        if (!$query->fetch()) {
            $pdo->exec('ALTER TABLE accounts ADD allowed_class_ids MEDIUMTEXT NULL AFTER avatar');
        }
    } catch (Throwable $error) {
        // Installer can add the column if runtime ALTER is blocked.
    }
}

function fetch_member_progress_map(PDO $pdo, array $memberIds): array
{
    $memberIds = array_values(array_unique(array_filter($memberIds)));

    if (!$memberIds) {
        return [];
    }

    try {
        $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
        $query = $pdo->prepare(
            "SELECT *
            FROM member_progress
            WHERE member_id IN ({$placeholders})
            ORDER BY last_activity_at DESC, updated_at DESC",
        );
        $query->execute($memberIds);
    } catch (Throwable $error) {
        return [];
    }

    $progressMap = [];

    foreach ($query->fetchAll() as $row) {
        $memberId = $row['member_id'];

        if (!isset($progressMap[$memberId])) {
            $progressMap[$memberId] = [];
        }

        $progressMap[$memberId][] = [
            'classId' => $row['class_id'],
            'classTitle' => $row['class_title'],
            'materialId' => $row['material_id'],
            'materialTitle' => $row['material_title'],
            'materialIndex' => (int) $row['material_index'],
            'materialCount' => (int) $row['material_count'],
            'progressPercent' => (int) $row['progress_percent'],
            'lastActivityAt' => member_api_datetime($row['last_activity_at'] ?? $row['updated_at'] ?? ''),
        ];
    }

    return $progressMap;
}

function map_member_account(array $account, array $progress = []): array
{
    $member = public_account($account);
    $member['lastSeenAt'] = member_api_datetime($account['last_seen_at'] ?? '');
    $member['isOnline'] = !empty($account['is_online']);
    $member['learningProgress'] = $progress;

    return $member;
}

function fetch_members(PDO $pdo): array
{
    try {
        $query = $pdo->prepare(
            'SELECT accounts.*, session_status.last_seen_at, COALESCE(session_status.is_online, 0) AS is_online
            FROM accounts
            LEFT JOIN (
                SELECT
                    account_id,
                    role,
                    MAX(last_seen_at) AS last_seen_at,
                    MAX(
                        CASE
                            WHEN expires_at > NOW()
                                AND last_seen_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
                            THEN 1
                            ELSE 0
                        END
                    ) AS is_online
                FROM auth_sessions
                WHERE role = ?
                GROUP BY account_id, role
            ) AS session_status
                ON session_status.account_id = accounts.id
                AND session_status.role = accounts.role
            WHERE accounts.role = ?
            ORDER BY accounts.created_at DESC, accounts.id DESC',
        );
        $query->execute(['member', 'member']);
    } catch (Throwable $error) {
        $query = $pdo->prepare(
            'SELECT * FROM accounts WHERE role = ? ORDER BY created_at DESC, id DESC',
        );
        $query->execute(['member']);
    }

    $accounts = $query->fetchAll();
    $progressMap = fetch_member_progress_map($pdo, array_column($accounts, 'id'));

    return array_map(function (array $account) use ($progressMap): array {
        return map_member_account($account, $progressMap[$account['id']] ?? []);
    }, $accounts);
}

function fetch_member_by_id(PDO $pdo, string $memberId): array
{
    try {
        $query = $pdo->prepare(
            'SELECT accounts.*, session_status.last_seen_at, COALESCE(session_status.is_online, 0) AS is_online
            FROM accounts
            LEFT JOIN (
                SELECT
                    account_id,
                    role,
                    MAX(last_seen_at) AS last_seen_at,
                    MAX(
                        CASE
                            WHEN expires_at > NOW()
                                AND last_seen_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
                            THEN 1
                            ELSE 0
                        END
                    ) AS is_online
                FROM auth_sessions
                WHERE role = ?
                GROUP BY account_id, role
            ) AS session_status
                ON session_status.account_id = accounts.id
                AND session_status.role = accounts.role
            WHERE accounts.role = ? AND accounts.id = ?
            LIMIT 1',
        );
        $query->execute(['member', 'member', $memberId]);
    } catch (Throwable $error) {
        $query = $pdo->prepare(
            'SELECT * FROM accounts WHERE role = ? AND id = ? LIMIT 1',
        );
        $query->execute(['member', $memberId]);
    }

    $member = $query->fetch();
    $progressMap = $member ? fetch_member_progress_map($pdo, [$member['id']]) : [];

    return $member ? [map_member_account($member, $progressMap[$member['id']] ?? [])] : [];
}

function encode_allowed_class_ids($value): ?string
{
    if ($value === null) {
        return null;
    }

    $ids = clean_allowed_class_ids($value);

    return json_encode($ids ?? [], JSON_UNESCAPED_UNICODE);
}

function assert_unique_member_username(PDO $pdo, string $username, string $ignoredId = ''): void
{
    $query = $pdo->prepare(
        'SELECT id FROM accounts WHERE role = ? AND username = ? AND id <> ? LIMIT 1',
    );
    $query->execute(['member', $username, $ignoredId]);

    if ($query->fetch()) {
        send_json(400, ['message' => 'Username sudah dipakai member lain.']);
    }
}

ensure_member_access_column($pdo);
$user = require_user();

if ($method === 'GET') {
    $members = ($user['role'] ?? '') === 'admin'
        ? fetch_members($pdo)
        : fetch_member_by_id($pdo, $user['userId'] ?? '');

    send_json(200, [
        'members' => $members,
        'updatedAt' => updated_at($pdo),
    ]);
}

if (($user['role'] ?? '') !== 'admin') {
    send_json(403, ['message' => 'Akses tidak diizinkan.']);
}

if ($method === 'POST') {
    $payload = read_json_body();
    $username = clean_username($payload['username'] ?? '');
    $password = (string) ($payload['password'] ?? '');

    if ($username === '' || strlen($password) < 6) {
        send_json(400, ['message' => 'Username dan password minimal 6 karakter wajib diisi.']);
    }

    assert_unique_member_username($pdo, $username);

    $insert = $pdo->prepare(
        'INSERT INTO accounts
        (id, role, name, username, email, status, avatar, allowed_class_ids, password_hash, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insert->execute([
        make_id('member'),
        'member',
        clean_text($payload['name'] ?? $username, 120),
        $username,
        clean_email($payload['email'] ?? ''),
        clean_text($payload['status'] ?? 'Aktif', 40),
        clean_image($payload['avatar'] ?? ''),
        encode_allowed_class_ids($payload['allowedClassIds'] ?? null),
        hash_password_value($password),
        date('Y-m-d'),
    ]);

    send_json(200, [
        'members' => fetch_members($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

if ($method === 'PUT') {
    $payload = read_json_body();
    $memberId = clean_text($payload['id'] ?? '', 120);
    $username = clean_username($payload['username'] ?? '');

    if ($memberId === '' || $username === '') {
        send_json(400, ['message' => 'Data member tidak ditemukan atau username kosong.']);
    }

    assert_unique_member_username($pdo, $username, $memberId);

    $currentQuery = $pdo->prepare(
        'SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1',
    );
    $currentQuery->execute([$memberId, 'member']);
    $current = $currentQuery->fetch();

    if (!$current) {
        send_json(404, ['message' => 'Member tidak ditemukan.']);
    }

    if (!empty($payload['password']) && strlen((string) $payload['password']) < 6) {
        send_json(400, ['message' => 'Password minimal 6 karakter.']);
    }

    $passwordHash = !empty($payload['password'])
        ? hash_password_value((string) $payload['password'])
        : $current['password_hash'];

    $update = $pdo->prepare(
        'UPDATE accounts
        SET name = ?, username = ?, email = ?, status = ?, avatar = ?, allowed_class_ids = ?, password_hash = ?
        WHERE id = ? AND role = ?',
    );
    $update->execute([
        clean_text($payload['name'] ?? $username, 120),
        $username,
        clean_email($payload['email'] ?? ''),
        clean_text($payload['status'] ?? 'Aktif', 40),
        clean_image($payload['avatar'] ?? '') ?: ($current['avatar'] ?? ''),
        encode_allowed_class_ids($payload['allowedClassIds'] ?? null),
        $passwordHash,
        $memberId,
        'member',
    ]);

    send_json(200, [
        'members' => fetch_members($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

$memberId = clean_text($_GET['id'] ?? '', 120);

if ($memberId === '') {
    send_json(400, ['message' => 'ID member wajib dikirim.']);
}

$delete = $pdo->prepare('DELETE FROM accounts WHERE id = ? AND role = ?');
$delete->execute([$memberId, 'member']);

try {
    $updateTickets = $pdo->prepare('UPDATE support_tickets SET status = ? WHERE member_id = ?');
    $updateTickets->execute(['Member dihapus', $memberId]);
} catch (Throwable $error) {
    // Support table may not exist yet on older installs.
}

try {
    $deleteProgress = $pdo->prepare('DELETE FROM member_progress WHERE member_id = ?');
    $deleteProgress->execute([$memberId]);
} catch (Throwable $error) {
    // Progress table may not exist yet on older installs.
}

send_json(200, [
    'members' => fetch_members($pdo),
    'updatedAt' => updated_at($pdo),
]);
