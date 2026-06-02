<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST']);

$token = request_session_token();

if ($token !== '') {
    try {
        $delete = db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?');
        $delete->execute([hash('sha256', $token)]);
    } catch (Throwable $error) {
        // Logout still clears the browser PHP session if the token table is unavailable.
    }
}

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'] ?? '',
        (bool) $params['secure'],
        (bool) $params['httponly'],
    );
}

session_destroy();

send_json(200, ['message' => 'Logout berhasil.']);
