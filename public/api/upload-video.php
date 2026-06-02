<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);
require_user('admin');

$config = api_config();
$maxMb = clean_number($config['max_video_upload_mb'] ?? 80, 1, 300);
$maxBytes = $maxMb * 1024 * 1024;
$allowed = [
    'mp4' => 'video/mp4',
    'webm' => 'video/webm',
    'ogg' => 'video/ogg',
    'mov' => 'video/quicktime',
    'm4v' => 'video/x-m4v',
];
$uploadErrors = [
    UPLOAD_ERR_INI_SIZE => 'Video melebihi upload_max_filesize hosting.',
    UPLOAD_ERR_FORM_SIZE => 'Video melebihi batas form upload.',
    UPLOAD_ERR_PARTIAL => 'Upload video terputus sebelum selesai.',
    UPLOAD_ERR_NO_FILE => 'File video belum dipilih.',
    UPLOAD_ERR_NO_TMP_DIR => 'Folder temporary upload hosting tidak tersedia.',
    UPLOAD_ERR_CANT_WRITE => 'Hosting gagal menulis file upload.',
    UPLOAD_ERR_EXTENSION => 'Upload dibatalkan oleh ekstensi PHP hosting.',
];

if (empty($_FILES['video']) || !is_array($_FILES['video'])) {
    $postMax = ini_get('post_max_size') ?: 'tidak diketahui';
    send_json(400, [
        'message' => 'File video wajib dikirim. Jika file sudah dipilih, ukurannya mungkin melewati post_max_size hosting (' . $postMax . ').',
    ]);
}

$file = $_FILES['video'];

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    $message = $uploadErrors[$errorCode] ?? 'Upload video gagal. Periksa batas upload hosting.';

    send_json(400, ['message' => $message]);
}

if (($file['size'] ?? 0) <= 0 || ($file['size'] ?? 0) > $maxBytes) {
    send_json(400, ['message' => 'Ukuran video maksimal ' . $maxMb . ' MB.']);
}

$originalName = clean_text($file['name'] ?? 'video', 160);
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

if (!isset($allowed[$extension])) {
    send_json(400, ['message' => 'Format video harus MP4, WebM, OGG, MOV, atau M4V.']);
}

$mimeType = $allowed[$extension];

if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $detectedType = $finfo ? finfo_file($finfo, $file['tmp_name']) : '';

    if ($finfo) {
        finfo_close($finfo);
    }

    if ($detectedType && in_array($detectedType, $allowed, true)) {
        $mimeType = $detectedType;
    }
}

$targetDir = ensure_video_upload_dir();

$storedName = make_id('video') . '.' . $extension;
$targetPath = $targetDir . DIRECTORY_SEPARATOR . $storedName;

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    send_json(500, ['message' => 'Video tidak bisa disimpan di hosting. Pastikan folder uploads/videos writable.']);
}

send_json(200, [
    'file' => $storedName,
    'name' => $originalName,
    'type' => $mimeType,
    'size' => (int) $file['size'],
]);
