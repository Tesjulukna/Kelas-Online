<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

function upload_size_to_bytes($value): int
{
    $value = trim((string) $value);

    if ($value === '') {
        return 0;
    }

    $unit = strtolower($value[strlen($value) - 1]);
    $number = (float) $value;

    if ($unit === 'g') {
        return (int) ($number * 1024 * 1024 * 1024);
    }

    if ($unit === 'm') {
        return (int) ($number * 1024 * 1024);
    }

    if ($unit === 'k') {
        return (int) ($number * 1024);
    }

    return (int) $number;
}

$postMax = upload_size_to_bytes(ini_get('post_max_size') ?: '0');
$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);

if ($postMax > 0 && $contentLength > $postMax) {
    send_json(413, [
        'message' => 'Ukuran upload melebihi batas server hosting. Kompres gambar atau naikkan post_max_size di hosting.',
    ]);
}

$user = require_user();
$type = clean_text($_POST['type'] ?? $_GET['type'] ?? '', 40);
$file = $_FILES['file'] ?? null;
$fileError = is_array($file) ? (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;

if (!$file || !is_array($file) || $fileError !== UPLOAD_ERR_OK) {
    $messages = [
        UPLOAD_ERR_INI_SIZE => 'Ukuran file melebihi upload_max_filesize server hosting.',
        UPLOAD_ERR_FORM_SIZE => 'Ukuran file melebihi batas form upload.',
        UPLOAD_ERR_PARTIAL => 'Upload file terputus. Coba ulangi dengan koneksi yang lebih stabil.',
        UPLOAD_ERR_NO_FILE => 'File upload wajib dikirim.',
        UPLOAD_ERR_NO_TMP_DIR => 'Folder temporary upload hosting belum tersedia.',
        UPLOAD_ERR_CANT_WRITE => 'Hosting tidak bisa menulis file upload.',
        UPLOAD_ERR_EXTENSION => 'Upload dihentikan ekstensi PHP hosting.',
    ];
    $statusCode = in_array($fileError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 400;

    send_json($statusCode, ['message' => $messages[$fileError] ?? 'File upload tidak diterima server.']);
}

$config = [
    'document' => [
        'dir' => 'dokumen',
        'max' => 12 * 1024 * 1024,
        'extensions' => ['pdf'],
        'mimes' => ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
    ],
    'task' => [
        'dir' => 'tugas',
        'max' => 20 * 1024 * 1024,
        'extensions' => ['jpg', 'jpeg', 'png', 'webp'],
        'mimes' => ['image/jpeg', 'image/png', 'image/webp'],
    ],
    'profile' => [
        'dir' => 'profiles',
        'max' => 20 * 1024 * 1024,
        'extensions' => ['jpg', 'jpeg', 'png', 'webp'],
        'mimes' => ['image/jpeg', 'image/png', 'image/webp'],
    ],
    'class-image' => [
        'dir' => 'gambar',
        'max' => 20 * 1024 * 1024,
        'extensions' => ['jpg', 'jpeg', 'png', 'webp'],
        'mimes' => ['image/jpeg', 'image/png', 'image/webp'],
    ],
    'certificate-image' => [
        'dir' => 'sertifikat',
        'max' => 20 * 1024 * 1024,
        'extensions' => ['jpg', 'jpeg', 'png', 'webp'],
        'mimes' => ['image/jpeg', 'image/png', 'image/webp'],
    ],
];

if (!isset($config[$type])) {
    send_json(400, ['message' => 'Tipe upload tidak valid.']);
}

if (in_array($type, ['document', 'class-image', 'certificate-image'], true) && ($user['role'] ?? '') !== 'admin') {
    send_json(403, ['message' => 'Hanya admin yang bisa upload file materi.']);
}

$rule = $config[$type];
$targetSubdir = $type === 'profile'
    ? 'profiles' . DIRECTORY_SEPARATOR . (($user['role'] ?? '') === 'admin' ? 'admin' : 'member')
    : $rule['dir'];
$publicUrlDir = $type === 'profile'
    ? 'profiles/' . (($user['role'] ?? '') === 'admin' ? 'admin' : 'member')
    : $rule['dir'];
$originalName = basename((string) ($file['name'] ?? 'file'));
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$mime = (string) ($file['type'] ?? '');
$size = (int) ($file['size'] ?? 0);

if (!in_array($extension, $rule['extensions'], true) || !in_array($mime, $rule['mimes'], true)) {
    send_json(400, ['message' => 'Format file tidak sesuai.']);
}

if ($size <= 0 || $size > $rule['max']) {
    send_json(400, ['message' => 'Ukuran file melebihi batas upload.']);
}

$tmpPath = (string) ($file['tmp_name'] ?? '');
$finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
$detectedMime = $finfo ? (string) finfo_file($finfo, $tmpPath) : '';

if ($finfo) {
    finfo_close($finfo);
}

if ($type === 'document') {
    $handle = @fopen($tmpPath, 'rb');
    $signature = $handle ? (string) fread($handle, 5) : '';

    if ($handle) {
        fclose($handle);
    }

    if (
        $signature !== '%PDF-' ||
        ($detectedMime !== '' && !in_array($detectedMime, ['application/pdf', 'application/octet-stream'], true))
    ) {
        send_json(400, ['message' => 'Isi file PDF tidak valid.']);
    }

    $mime = 'application/pdf';
} else {
    $imageInfo = @getimagesize($tmpPath);

    if (!$imageInfo || empty($imageInfo['mime']) || !in_array($imageInfo['mime'], $rule['mimes'], true)) {
        send_json(400, ['message' => 'Isi file gambar tidak valid.']);
    }

    if ($detectedMime !== '' && !in_array($detectedMime, $rule['mimes'], true)) {
        send_json(400, ['message' => 'MIME file gambar tidak valid.']);
    }

    $mime = $imageInfo['mime'];
}

$publicDir = dirname(__DIR__);
$uploadsDir = $publicDir . DIRECTORY_SEPARATOR . 'uploads';
$targetDir = $uploadsDir . DIRECTORY_SEPARATOR . $targetSubdir;

foreach ([$uploadsDir, $targetDir] as $dir) {
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        send_json(500, ['message' => 'Folder upload tidak bisa dibuat di hosting.']);
    }
}

$rootHtaccess = $uploadsDir . DIRECTORY_SEPARATOR . '.htaccess';

if (!is_file($rootHtaccess)) {
    @file_put_contents($rootHtaccess, "Options -Indexes\n");
}

if (!is_writable($targetDir)) {
    send_json(500, ['message' => 'Folder upload belum bisa ditulis hosting.']);
}

$safeBaseName = preg_replace('/[^a-zA-Z0-9._-]+/', '-', pathinfo($originalName, PATHINFO_FILENAME)) ?: 'file';
$fileName = sprintf(
    '%s-%s-%s.%s',
    $type,
    time(),
    bin2hex(random_bytes(4)),
    $extension,
);
$targetPath = $targetDir . DIRECTORY_SEPARATOR . $fileName;

if (!move_uploaded_file((string) $file['tmp_name'], $targetPath)) {
    send_json(500, ['message' => 'File gagal disimpan ke hosting.']);
}

send_json(200, [
    'name' => $originalName ?: $safeBaseName . '.' . $extension,
    'file' => $fileName,
    'url' => '/uploads/' . $publicUrlDir . '/' . $fileName,
    'type' => $mime,
    'size' => $size,
]);
