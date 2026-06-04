<?php

function config_env(string $key, string $fallback = ''): string
{
    $value = getenv($key);

    return $value === false || $value === '' ? $fallback : $value;
}

return [
    'db_host' => config_env('IBNU_DB_HOST', 'ISI_HOST_DATABASE'),
    'db_name' => config_env('IBNU_DB_NAME', 'ISI_NAMA_DATABASE'),
    'db_user' => config_env('IBNU_DB_USER', 'ISI_USER_DATABASE'),
    'db_pass' => config_env('IBNU_DB_PASS', 'ISI_PASSWORD_DATABASE'),

    'allow_install' => config_env('IBNU_ALLOW_INSTALL', 'false') === 'true',
    'install_secret' => config_env('IBNU_INSTALL_SECRET'),
    'install_reset_admin_password' => config_env('IBNU_INSTALL_RESET_ADMIN_PASSWORD') === 'true',
    'max_video_upload_mb' => (int) config_env('IBNU_MAX_VIDEO_UPLOAD_MB', '80'),
    'default_admin_name' => config_env('IBNU_DEFAULT_ADMIN_NAME', 'Admin IbnuCreative'),
    'default_admin_username' => config_env('IBNU_DEFAULT_ADMIN_USERNAME', 'admin'),
    'default_admin_password' => config_env('IBNU_DEFAULT_ADMIN_PASSWORD', 'admin123'),
    'default_member_name' => config_env('IBNU_DEFAULT_MEMBER_NAME', 'Sahabat Kreatif'),
    'default_member_username' => config_env('IBNU_DEFAULT_MEMBER_USERNAME', 'member'),
    'default_member_password' => config_env('IBNU_DEFAULT_MEMBER_PASSWORD', 'member123'),

    // Isi dengan Merchant Key dari halaman Webhook Lynk.id.
    // Setelah diisi, URL webhook cukup:
    // https://domain-anda.com/api/lynk-webhook.php
    'lynk_webhook_secret' => config_env('LYNK_WEBHOOK_SECRET'),
    'site_login_url' => config_env('SITE_LOGIN_URL'),
    'lynk_reset_existing_member_password' => config_env('LYNK_RESET_EXISTING_MEMBER_PASSWORD') === 'true',
    'lynk_send_credentials_email' => config_env('LYNK_SEND_CREDENTIALS_EMAIL', 'true') === 'true',
    'lynk_email_from' => config_env('LYNK_EMAIL_FROM'),
    // Akun member hanya dibuat kalau produk Lynk cocok dengan:
    // 1. field "Kode produk Lynk.id" pada kelas di dashboard admin, atau
    // 2. mapping manual di bawah ini.
    // Produk Lynk lain seperti sepatu, merchandise, jasa, dll akan diabaikan.
    'lynk_product_class_map' => [],
];
