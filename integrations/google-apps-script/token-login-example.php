<?php

declare(strict_types=1);

// Copy _account-gas.php alongside this file on the TARGET website's backend.
// Set GOOGLE_SHEETS_GAS_URL, GOOGLE_SHEETS_GAS_SECRET, TOKEN_SPREADSHEET_ID,
// and TOKEN_SHEET_TAB as server environment variables. Never expose them in JS.
// If your application already defines api_config(), use its config instead.
if (!function_exists('api_config')) {
    function api_config(): array { return []; }
}
require_once __DIR__ . '/_account-gas.php';

function verify_website_login_token(string $submittedToken): ?array
{
    $token = trim($submittedToken);
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $spreadsheet = (string) getenv('TOKEN_SPREADSHEET_ID');
    $tab = (string) getenv('TOKEN_SHEET_TAB');
    if ($spreadsheet === '' || $tab === '') throw new RuntimeException('Tab login server belum dikonfigurasi.');
    $result = account_gas_request('validate_token', $spreadsheet, ['tab' => $tab, 'token' => $token]);
    if (($result['valid'] ?? false) !== true || empty($result['accountId'])) return null;
    // Only after a non-null return may your login controller regenerate the
    // session ID and store accountId/name in its server-side session.
    return ['accountId' => $result['accountId'], 'name' => $result['name'] ?? '', 'expiresAt' => $result['expiresAt'] ?? null];
}
