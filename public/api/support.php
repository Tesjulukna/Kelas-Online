<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST', 'PUT', 'DELETE']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function ensure_support_replies_column(PDO $pdo): void
{
    try {
        $query = $pdo->prepare('SHOW COLUMNS FROM support_tickets LIKE ?');
        $query->execute(['replies']);

        if (!$query->fetch()) {
            $pdo->exec('ALTER TABLE support_tickets ADD replies MEDIUMTEXT NULL AFTER answer');
        }
    } catch (Throwable $error) {
        // Keep older installs readable; installer can add the column explicitly.
    }
}

ensure_support_replies_column($pdo);

function clean_reply_message($value): string
{
    return clean_text($value, 600);
}

function decode_support_replies(array $ticket): array
{
    $rawReplies = json_decode((string) ($ticket['replies'] ?? ''), true);
    $replies = is_array($rawReplies) ? $rawReplies : [];
    $cleanReplies = array_values(array_filter(array_map(function ($reply): ?array {
        if (!is_array($reply)) {
            return null;
        }

        $message = clean_reply_message($reply['message'] ?? '');

        if ($message === '') {
            return null;
        }

        $senderRole = ($reply['senderRole'] ?? '') === 'admin' ? 'admin' : 'member';

        return [
            'id' => clean_text($reply['id'] ?? make_id('reply'), 90),
            'senderRole' => $senderRole,
            'senderName' => clean_text($reply['senderName'] ?? ($senderRole === 'admin' ? 'Admin' : ($ticket['member_name'] ?? 'Member')), 100),
            'message' => $message,
            'createdAt' => clean_text($reply['createdAt'] ?? ($ticket['created_at'] ?? date(DATE_ATOM)), 40),
        ];
    }, $replies)));

    if ($cleanReplies) {
        return $cleanReplies;
    }

    $fallback = [];

    if (!empty($ticket['message'])) {
        $fallback[] = [
            'id' => ($ticket['id'] ?? 'ticket') . '-question',
            'senderRole' => 'member',
            'senderName' => clean_text($ticket['member_name'] ?? 'Member', 100),
            'message' => clean_reply_message($ticket['message']),
            'createdAt' => clean_text($ticket['created_at'] ?? date(DATE_ATOM), 40),
        ];
    }

    if (!empty($ticket['answer'])) {
        $fallback[] = [
            'id' => ($ticket['id'] ?? 'ticket') . '-answer',
            'senderRole' => 'admin',
            'senderName' => 'Admin',
            'message' => clean_reply_message($ticket['answer']),
            'createdAt' => clean_text($ticket['created_at'] ?? date(DATE_ATOM), 40),
        ];
    }

    return $fallback;
}

function fetch_support_tickets(PDO $pdo): array
{
    $tickets = $pdo
        ->query('SELECT * FROM support_tickets ORDER BY created_at DESC, id DESC')
        ->fetchAll();

    return map_support_tickets($tickets);
}

function fetch_member_support_tickets(PDO $pdo, string $memberId): array
{
    $query = $pdo->prepare(
        'SELECT * FROM support_tickets WHERE member_id = ? ORDER BY created_at DESC, id DESC',
    );
    $query->execute([$memberId]);

    return map_support_tickets($query->fetchAll());
}

function map_support_tickets(array $tickets): array
{
    return array_map(function (array $ticket): array {
        return [
            'id' => $ticket['id'],
            'memberId' => $ticket['member_id'],
            'memberName' => $ticket['member_name'],
            'subject' => $ticket['subject'],
            'message' => $ticket['message'],
            'status' => $ticket['status'],
            'priority' => $ticket['priority'],
            'answer' => $ticket['answer'],
            'replies' => decode_support_replies($ticket),
            'createdAt' => $ticket['created_at'],
        ];
    }, $tickets);
}

if ($method === 'GET') {
    $user = require_user();

    if (($user['role'] ?? '') !== 'admin') {
        send_json(200, [
            'supportTickets' => fetch_member_support_tickets($pdo, $user['userId']),
            'updatedAt' => updated_at($pdo),
        ]);
    }

    send_json(200, [
        'supportTickets' => fetch_support_tickets($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

$payload = read_json_body();

if ($method === 'POST') {
    $user = require_user();
    $message = clean_text($payload['message'] ?? '', 600);

    if ($message === '') {
        send_json(400, ['message' => 'Pertanyaan bantuan wajib diisi.']);
    }

    $insert = $pdo->prepare(
        'INSERT INTO support_tickets
        (id, member_id, member_name, subject, message, status, priority, answer, replies, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $ticketId = make_id('ticket');
    $createdAt = date(DATE_ATOM);
    $replies = [[
        'id' => make_id('reply'),
        'senderRole' => 'member',
        'senderName' => $user['name'] ?? 'Member',
        'message' => $message,
        'createdAt' => $createdAt,
    ]];

    $insert->execute([
        $ticketId,
        $user['userId'] ?? '',
        $user['name'] ?? 'Member',
        clean_text($payload['subject'] ?? 'Bantuan mentor', 120),
        $message,
        'Menunggu',
        clean_text($payload['priority'] ?? 'Normal', 40),
        '',
        json_encode($replies, JSON_UNESCAPED_UNICODE),
        $createdAt,
    ]);

    if (($user['role'] ?? '') !== 'admin') {
        send_json(200, [
            'supportTickets' => fetch_member_support_tickets($pdo, $user['userId']),
            'updatedAt' => updated_at($pdo),
        ]);
    }

    send_json(200, [
        'supportTickets' => fetch_support_tickets($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

if ($method === 'PUT') {
    $user = require_user();
    $ticketId = clean_text($payload['id'] ?? '', 90);

    if ($ticketId === '') {
        send_json(400, ['message' => 'ID tiket bantuan wajib dikirim.']);
    }

    $ticketQuery = $pdo->prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1');
    $ticketQuery->execute([$ticketId]);
    $ticket = $ticketQuery->fetch();

    if (!$ticket) {
        send_json(404, ['message' => 'Tiket bantuan tidak ditemukan.']);
    }

    if (($user['role'] ?? '') !== 'admin' && ($ticket['member_id'] ?? '') !== ($user['userId'] ?? '')) {
        send_json(403, ['message' => 'Akses tiket tidak diizinkan.']);
    }

    $message = clean_reply_message($payload['message'] ?? $payload['answer'] ?? '');
    $senderRole = ($user['role'] ?? '') === 'admin' ? 'admin' : 'member';
    $replies = decode_support_replies($ticket);

    if ($message !== '') {
        $replies[] = [
            'id' => make_id('reply'),
            'senderRole' => $senderRole,
            'senderName' => $user['name'] ?? ($senderRole === 'admin' ? 'Admin' : 'Member'),
            'message' => $message,
            'createdAt' => date(DATE_ATOM),
        ];
    }

    $update = $pdo->prepare(
        'UPDATE support_tickets SET status = ?, answer = ?, replies = ? WHERE id = ?',
    );
    $update->execute([
        clean_text($payload['status'] ?? 'Menunggu', 40),
        $senderRole === 'admin' && $message !== ''
            ? $message
            : clean_text($ticket['answer'] ?? '', 600),
        json_encode($replies, JSON_UNESCAPED_UNICODE),
        $ticketId,
    ]);

    if ($senderRole !== 'admin') {
        send_json(200, [
            'supportTickets' => fetch_member_support_tickets($pdo, $user['userId']),
            'updatedAt' => updated_at($pdo),
        ]);
    }

    send_json(200, [
        'supportTickets' => fetch_support_tickets($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

require_user('admin');

$ticketId = clean_text($_GET['id'] ?? '', 90);

if ($ticketId === '') {
    send_json(400, ['message' => 'ID tiket bantuan wajib dikirim.']);
}

$delete = $pdo->prepare('DELETE FROM support_tickets WHERE id = ?');
$delete->execute([$ticketId]);

send_json(200, [
    'supportTickets' => fetch_support_tickets($pdo),
    'updatedAt' => updated_at($pdo),
]);
