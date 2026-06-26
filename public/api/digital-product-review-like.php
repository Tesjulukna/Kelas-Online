<?php

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_digital-products-common.php';

ensure_method(['POST']);

$pdo = db();
$payload = read_json_body();
$productId = clean_text($payload['productId'] ?? '', 120);
$reviewId = clean_text($payload['reviewId'] ?? '', 120);
$liked = ($payload['liked'] ?? false) === true;

if ($productId === '' || $reviewId === '') {
    send_json(400, ['message' => 'ID produk dan review wajib dikirim.']);
}

$query = $pdo->prepare('SELECT * FROM digital_products WHERE id = ? LIMIT 1');
$query->execute([$productId]);
$product = $query->fetch();

if (!$product) {
    send_json(404, ['message' => 'Produk digital tidak ditemukan.']);
}

$reviews = digital_json($product['reviews'] ?? '[]');

foreach ($reviews as &$review) {
    if (clean_text($review['id'] ?? '', 120) === $reviewId) {
        $likes = clean_number($review['likes'] ?? 0, 0, 1000000);
        $review['likes'] = max(0, $likes + ($liked ? 1 : -1));
        break;
    }
}
unset($review);

$update = $pdo->prepare('UPDATE digital_products SET reviews = ? WHERE id = ?');
$update->execute([json_encode($reviews, JSON_UNESCAPED_UNICODE), $productId]);

send_json(200, fetch_digital_products($pdo, current_user()));
