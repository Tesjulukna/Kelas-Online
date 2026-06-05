<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'PUT']);

$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function ensure_material_support_columns(PDO $pdo): void
{
    $columns = [
        'pdf_file' => 'MEDIUMTEXT NULL AFTER video_type',
        'pdf_name' => "VARCHAR(180) NOT NULL DEFAULT '' AFTER pdf_file",
        'resource_links' => 'MEDIUMTEXT NULL AFTER pdf_name',
        'description' => 'MEDIUMTEXT NULL AFTER title',
        'allow_task_image' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER requires_task',
        'require_task_image' => 'TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_task_image',
    ];

    foreach ($columns as $column => $definition) {
        try {
            $query = $pdo->prepare('SHOW COLUMNS FROM materials LIKE ?');
            $query->execute([$column]);

            if (!$query->fetch()) {
                $pdo->exec("ALTER TABLE materials ADD {$column} {$definition}");
            }
        } catch (Throwable $error) {
            // The installer can add the columns explicitly if runtime ALTER is blocked.
        }
    }
}

function ensure_prompt_text_capacity(PDO $pdo): void
{
    $columns = [
        ['material_assets', 'prompt', 'LONGTEXT NULL'],
        ['material_assets', 'instruction', 'LONGTEXT NULL'],
        ['materials', 'task_prompt', 'LONGTEXT NULL'],
    ];

    foreach ($columns as [$table, $column, $definition]) {
        try {
            $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
            $query->execute([$column]);
            $current = $query->fetch();

            if (!$current) {
                $pdo->exec("ALTER TABLE `$table` ADD `$column` $definition");
            } elseif (stripos((string) ($current['Type'] ?? ''), 'longtext') === false) {
                $pdo->exec("ALTER TABLE `$table` MODIFY `$column` $definition");
            }
        } catch (Throwable $error) {
            // The installer can update column types if runtime ALTER is blocked.
        }
    }
}

function clean_prompt_text($value): string
{
    return str_replace("\0", '', (string) ($value ?? ''));
}

ensure_material_support_columns($pdo);
ensure_prompt_text_capacity($pdo);

try {
    $query = $pdo->prepare('SHOW COLUMNS FROM classes LIKE ?');
    $query->execute(['lynk_product_key']);

    if (!$query->fetch()) {
        $pdo->exec("ALTER TABLE classes ADD lynk_product_key VARCHAR(180) NOT NULL DEFAULT '' AFTER revenue");
    }
} catch (Throwable $error) {
    // Installer can add the column if runtime ALTER is blocked.
}

if ($method === 'GET') {
    send_json(200, [
        'classes' => fetch_classes($pdo),
        'updatedAt' => updated_at($pdo),
    ]);
}

require_user('admin');

$payload = read_json_body();
$classes = is_array($payload['classes'] ?? null) ? $payload['classes'] : [];

$insertClass = $pdo->prepare(
    'INSERT INTO classes
    (id, title, students, status, revenue, lynk_product_key, thumbnail, mentor, progress, next_label, live_at, lessons)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
$insertMaterial = $pdo->prepare(
    'INSERT INTO materials
    (id, class_id, sort_order, title, description, video_url, video_file, video_name, video_type, pdf_file, pdf_name, resource_links, requires_task, allow_task_image, require_task_image, task_prompt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
$insertAsset = $pdo->prepare(
    'INSERT INTO material_assets
    (id, material_id, sort_order, title, image, instruction, prompt)
    VALUES (?, ?, ?, ?, ?, ?, ?)',
);

try {
    $pdo->beginTransaction();
    $pdo->exec('DELETE FROM classes');

    foreach (array_slice($classes, 0, 200) as $classIndex => $class) {
        if (!is_array($class)) {
            continue;
        }

        $classId = clean_text($class['id'] ?? make_id('class'), 120);

        if ($classId === '') {
            $classId = make_id('class');
        }

        $materials = is_array($class['materials'] ?? null) ? $class['materials'] : [];

        $insertClass->execute([
            $classId,
            clean_text($class['title'] ?? 'Kelas ' . ($classIndex + 1), 160),
            clean_number($class['students'] ?? 0, 0, 1000000),
            clean_text($class['status'] ?? 'Aktif', 40),
            clean_text($class['revenue'] ?? 'Rp 0', 80),
            clean_text($class['lynkProductKey'] ?? '', 180),
            clean_image($class['thumbnail'] ?? ''),
            clean_text($class['mentor'] ?? 'Ibnu Creative', 120),
            clean_number($class['progress'] ?? 0, 0, 100),
            clean_text($class['next'] ?? 'Lanjutkan modul berikutnya', 160),
            clean_text($class['liveAt'] ?? 'Jadwal menyusul', 160),
            clean_text($class['lessons'] ?? count($materials) . ' materi', 80),
        ]);

        foreach (array_slice($materials, 0, 80) as $materialIndex => $material) {
            if (!is_array($material)) {
                continue;
            }

            $materialId = clean_text($material['id'] ?? make_id('material'), 120);

            if ($materialId === '') {
                $materialId = make_id('material');
            }

            $insertMaterial->execute([
                $materialId,
                $classId,
                $materialIndex + 1,
                clean_text($material['title'] ?? 'Materi ' . ($materialIndex + 1), 160),
                clean_rich_html($material['description'] ?? ''),
                clean_youtube_url($material['videoUrl'] ?? ''),
                clean_video_file($material['videoFile'] ?? ''),
                clean_text($material['videoName'] ?? '', 180),
                clean_video_type($material['videoType'] ?? ''),
                clean_pdf_file($material['pdfFile'] ?? ''),
                clean_text($material['pdfName'] ?? '', 180),
                json_encode(clean_resource_links($material['resourceLinks'] ?? []), JSON_UNESCAPED_UNICODE),
                !empty($material['requiresTask']) ? 1 : 0,
                array_key_exists('allowTaskImage', $material) && empty($material['allowTaskImage']) ? 0 : 1,
                !empty($material['requireTaskImage']) ? 1 : 0,
                clean_text(
                    $material['taskPrompt'] ?? 'Kirim link tugas atau catatan praktik materi ini.',
                    500,
                ),
            ]);

            $assets = is_array($material['promptItems'] ?? null)
                ? $material['promptItems']
                : [];

            foreach (array_slice($assets, 0, 80) as $assetIndex => $asset) {
                if (!is_array($asset)) {
                    continue;
                }

                if (empty($asset['image']) && empty($asset['prompt']) && empty($asset['instruction'])) {
                    continue;
                }

                $insertAsset->execute([
                    clean_text($asset['id'] ?? make_id('asset'), 120),
                    $materialId,
                    $assetIndex + 1,
                    clean_text($asset['title'] ?? 'Prompt ' . ($assetIndex + 1), 160),
                    clean_image($asset['image'] ?? ''),
                    clean_prompt_text($asset['instruction'] ?? ''),
                    clean_prompt_text($asset['prompt'] ?? ''),
                ]);
            }
        }
    }

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    send_json(500, ['message' => 'Kelas tidak bisa disimpan.']);
}

send_json(200, [
    'classes' => fetch_classes($pdo),
    'updatedAt' => updated_at($pdo),
]);
