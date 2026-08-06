<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['POST']);

send_json(410, [
    'message' => 'Metode pembayaran PayPal sudah dinonaktifkan. Silakan pilih metode pembayaran lain.',
]);
