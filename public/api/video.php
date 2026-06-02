<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET']);
require_user();

$fileName = clean_video_file($_GET['file'] ?? '');

if ($fileName === '') {
    http_response_code(404);
    exit;
}

$baseDir = realpath(__DIR__ . '/../uploads/videos');
$filePath = $baseDir ? realpath($baseDir . DIRECTORY_SEPARATOR . $fileName) : false;

if (!$baseDir || !$filePath || strpos($filePath, $baseDir) !== 0 || !is_file($filePath)) {
    http_response_code(404);
    exit;
}

$extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
$types = [
    'mp4' => 'video/mp4',
    'webm' => 'video/webm',
    'ogg' => 'video/ogg',
    'mov' => 'video/quicktime',
    'm4v' => 'video/x-m4v',
];
$type = $types[$extension] ?? 'application/octet-stream';
$size = filesize($filePath);
$start = 0;
$end = $size - 1;

header('Content-Type: ' . $type);
header('Accept-Ranges: bytes');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="materi-' . $fileName . '"');
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');

if (!empty($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $matches)) {
    if ($matches[1] !== '') {
        $start = (int) $matches[1];
    }

    if ($matches[2] !== '') {
        $end = (int) $matches[2];
    }

    $start = max(0, min($start, $size - 1));
    $end = max($start, min($end, $size - 1));
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
}

$length = $end - $start + 1;
header('Content-Length: ' . $length);

$handle = fopen($filePath, 'rb');

if (!$handle) {
    http_response_code(500);
    exit;
}

fseek($handle, $start);
$remaining = $length;

while ($remaining > 0 && !feof($handle)) {
    $chunkSize = min(8192, $remaining);
    echo fread($handle, $chunkSize);
    flush();
    $remaining -= $chunkSize;
}

fclose($handle);
exit;
