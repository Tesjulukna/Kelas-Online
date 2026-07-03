<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST', 'PUT', 'DELETE']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function ensure_submission_attachment_columns(PDO $pdo): void
{
    $columns = [
        'attachment_url' => "VARCHAR(240) NOT NULL DEFAULT '' AFTER answer",
        'attachment_name' => "VARCHAR(180) NOT NULL DEFAULT '' AFTER attachment_url",
        'rating' => 'TINYINT NOT NULL DEFAULT 0 AFTER feedback',
    ];

    foreach ($columns as $column => $definition) {
        try {
            $query = $pdo->prepare('SHOW COLUMNS FROM submissions LIKE ?');
            $query->execute([$column]);

            if (!$query->fetch()) {
                $pdo->exec("ALTER TABLE submissions ADD {$column} {$definition}");
            }
        } catch (Throwable $error) {
            // Installer can add these columns if runtime ALTER is blocked.
        }
    }
}

ensure_submission_attachment_columns($pdo);

function map_submission(array $submission): array
{
    return [
        'id' => $submission['id'],
        'memberId' => $submission['member_id'],
        'memberName' => $submission['member_name'],
        'classId' => $submission['class_id'],
        'classTitle' => $submission['class_title'],
        'materialId' => $submission['material_id'],
        'materialTitle' => $submission['material_title'],
        'answer' => $submission['answer'],
        'attachmentUrl' => $submission['attachment_url'] ?? '',
        'attachmentName' => $submission['attachment_name'] ?? '',
        'status' => $submission['status'],
        'feedback' => $submission['feedback'] ?? '',
        'rating' => (int) ($submission['rating'] ?? 0),
        'submittedAt' => $submission['submitted_at'],
    ];
}

function fetch_submissions(PDO $pdo, ?array $user = null): array
{
    if ($user && ($user['role'] ?? '') === 'member') {
        $query = $pdo->prepare(
            'SELECT * FROM submissions WHERE member_id = ? ORDER BY submitted_at DESC, id DESC',
        );
        $query->execute([$user['userId']]);

        return array_map('map_submission', $query->fetchAll());
    }

    $query = $pdo->query('SELECT * FROM submissions ORDER BY submitted_at DESC, id DESC');

    return array_map('map_submission', $query->fetchAll());
}

if ($method === 'GET') {
    $user = require_user();

    send_json(200, [
        'submissions' => fetch_submissions($pdo, $user),
        'updatedAt' => updated_at($pdo),
    ]);
}

if ($method === 'POST') {
    $user = require_user('member');
    $payload = read_json_body();
    $answer = clean_text($payload['answer'] ?? '', 1200);

    if ($answer === '') {
        send_json(400, ['message' => 'Isi tugas wajib dikirim.']);
    }

    $insert = $pdo->prepare(
        'INSERT INTO submissions
        (id, member_id, member_name, class_id, class_title, material_id, material_title, answer, attachment_url, attachment_name, status, feedback, rating, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insert->execute([
        make_id('submission'),
        $user['userId'],
        $user['name'],
        clean_text($payload['classId'] ?? '', 90),
        clean_text($payload['classTitle'] ?? '', 140),
        clean_text($payload['materialId'] ?? '', 90),
        clean_text($payload['materialTitle'] ?? '', 140),
        $answer,
        clean_image($payload['attachmentUrl'] ?? ''),
        clean_text($payload['attachmentName'] ?? '', 180),
        'Menunggu Review',
        '',
        0,
        date(DATE_ATOM),
    ]);

    send_json(200, [
        'submissions' => fetch_submissions($pdo, $user),
        'updatedAt' => updated_at($pdo),
    ]);
}

if ($method === 'PUT') {
    $user = require_user();
    $payload = read_json_body();
    $submissionId = clean_text($payload['id'] ?? '', 90);

    if ($submissionId === '') {
        send_json(400, ['message' => 'ID tugas wajib dikirim.']);
    }

    if (($user['role'] ?? '') === 'member') {
        $answer = clean_text($payload['answer'] ?? '', 1200);

        if ($answer === '') {
            send_json(400, ['message' => 'Isi tugas wajib dikirim.']);
        }

        $query = $pdo->prepare('SELECT * FROM submissions WHERE id = ? AND member_id = ? LIMIT 1');
        $query->execute([$submissionId, $user['userId']]);
        $submission = $query->fetch();

        if (!$submission) {
            send_json(404, ['message' => 'Tugas tidak ditemukan.']);
        }

        $status = (string) ($submission['status'] ?? '');
        $hasFeedback = trim((string) ($submission['feedback'] ?? '')) !== '' ||
            (int) ($submission['rating'] ?? 0) > 0;
        $canEdit = $status === 'Menunggu Review' && !$hasFeedback;
        $canRevise = $status === 'Perlu Revisi';

        if (!$canEdit && !$canRevise) {
            send_json(403, ['message' => 'Tugas sudah diberi feedback dan tidak bisa diubah.']);
        }

        $update = $pdo->prepare(
            'UPDATE submissions
            SET answer = ?, attachment_url = ?, attachment_name = ?, status = ?, feedback = ?, rating = ?, submitted_at = ?
            WHERE id = ? AND member_id = ?',
        );
        $update->execute([
            $answer,
            clean_image($payload['attachmentUrl'] ?? ''),
            clean_text($payload['attachmentName'] ?? '', 180),
            'Menunggu Review',
            '',
            0,
            date(DATE_ATOM),
            $submissionId,
            $user['userId'],
        ]);

        send_json(200, [
            'submissions' => fetch_submissions($pdo, $user),
            'updatedAt' => updated_at($pdo),
        ]);
    }

    if (($user['role'] ?? '') !== 'admin') {
        send_json(403, ['message' => 'Akses tidak diizinkan.']);
    }

    $status = clean_text($payload['status'] ?? 'Direview', 40);
    $allowedStatuses = ['Menunggu Review', 'Direview', 'Selesai', 'Disetujui', 'Perlu Revisi'];

    if (!in_array($status, $allowedStatuses, true)) {
        $status = 'Direview';
    }

    $update = $pdo->prepare(
        'UPDATE submissions SET status = ?, feedback = ?, rating = ? WHERE id = ?',
    );
    $update->execute([
        $status,
        clean_text($payload['feedback'] ?? '', 1200),
        clean_number($payload['rating'] ?? 0, 0, 5),
        $submissionId,
    ]);

    send_json(200, [
        'submissions' => fetch_submissions($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

require_user('admin');

$submissionId = clean_text($_GET['id'] ?? '', 90);

if ($submissionId === '') {
    send_json(400, ['message' => 'ID tugas wajib dikirim.']);
}

$delete = $pdo->prepare('DELETE FROM submissions WHERE id = ?');
$delete->execute([$submissionId]);

send_json(200, [
    'submissions' => fetch_submissions($pdo),
    'updatedAt' => updated_at($pdo),
]);
