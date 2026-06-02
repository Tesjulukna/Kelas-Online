<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

$pdo = db();
$user = require_user('member');
$payload = read_json_body();

function ensure_member_progress_table(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS member_progress (
            member_id VARCHAR(120) NOT NULL,
            class_id VARCHAR(120) NOT NULL,
            class_title VARCHAR(160) NOT NULL DEFAULT '',
            material_id VARCHAR(120) NOT NULL DEFAULT '',
            material_title VARCHAR(160) NOT NULL DEFAULT '',
            material_index INT NOT NULL DEFAULT 0,
            material_count INT NOT NULL DEFAULT 0,
            progress_percent INT NOT NULL DEFAULT 0,
            last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (member_id, class_id),
            INDEX member_progress_member_index (member_id),
            INDEX member_progress_activity_index (last_activity_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
}

ensure_member_progress_table($pdo);

$classId = clean_text($payload['classId'] ?? '', 120);
$classTitle = clean_text($payload['classTitle'] ?? 'Kelas', 160);
$materialId = clean_text($payload['materialId'] ?? '', 120);
$materialTitle = clean_text($payload['materialTitle'] ?? 'Materi', 160);
$materialIndex = clean_number($payload['materialIndex'] ?? 0, 0, 10000);
$materialCount = clean_number($payload['materialCount'] ?? 0, 0, 10000);

if ($classId === '' || $materialId === '') {
    send_json(400, ['message' => 'Data progress materi tidak lengkap.']);
}

$safeMaterialCount = max(1, $materialCount);
$progressPercent = min(
    100,
    max(0, (int) round((min($safeMaterialCount, $materialIndex + 1) / $safeMaterialCount) * 100)),
);

$upsert = $pdo->prepare(
    'INSERT INTO member_progress
    (member_id, class_id, class_title, material_id, material_title, material_index, material_count, progress_percent, last_activity_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
        class_title = VALUES(class_title),
        material_id = IF(VALUES(material_index) >= material_index, VALUES(material_id), material_id),
        material_title = IF(VALUES(material_index) >= material_index, VALUES(material_title), material_title),
        material_index = GREATEST(material_index, VALUES(material_index)),
        material_count = VALUES(material_count),
        progress_percent = GREATEST(progress_percent, VALUES(progress_percent)),
        last_activity_at = NOW()',
);
$upsert->execute([
    $user['userId'],
    $classId,
    $classTitle,
    $materialId,
    $materialTitle,
    $materialIndex,
    $safeMaterialCount,
    $progressPercent,
]);

send_json(200, [
    'ok' => true,
    'updatedAt' => updated_at($pdo),
]);
