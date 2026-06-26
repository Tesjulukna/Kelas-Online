<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

$user = require_user();
$type = clean_text($_POST['type'] ?? $_GET['type'] ?? '', 40);
$file = $_FILES['file'] ?? null;

if (!$file || !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    send_json(400, ['message' => 'File upload wajib dikirim.']);
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
