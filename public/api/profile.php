<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'PUT']);

$user = require_user();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function profile_session_from_account(array $account, string $token = ''): array
{
    return [
        'userId' => $account['id'],
        'name' => $account['name'],
        'username' => $account['username'],
        'role' => $account['role'],
        'avatar' => $account['avatar'] ?? '',
        'allowedClassIds' => ($account['role'] ?? '') === 'member'
            ? clean_allowed_class_ids($account['allowed_class_ids'] ?? null)
            : null,
        'token' => $token,
        'signedInAt' => $_SESSION['user']['signedInAt'] ?? date(DATE_ATOM),
    ];
}

if ($method === 'PUT') {
    $payload = read_json_body();
    $name = clean_text($payload['name'] ?? $user['name'] ?? 'Sahabat Kreatif', 100);
    $avatar = clean_image($payload['avatar'] ?? '');

    $update = $pdo->prepare(
        'UPDATE accounts SET name = ?, avatar = ? WHERE id = ? AND role = ?',
    );
    $update->execute([$name, $avatar, $user['userId'], $user['role']]);
}

$query = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND role = ? LIMIT 1');
$query->execute([$user['userId'], $user['role']]);
$account = $query->fetch();

if (!$account) {
    send_json(404, ['message' => 'Akun tidak ditemukan.']);
}

$_SESSION['user'] = profile_session_from_account($account, $user['token'] ?? '');

send_json(200, ['session' => $_SESSION['user']]);
