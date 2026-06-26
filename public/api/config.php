<?php

function config_env(string $key, string $fallback = ''): string
{
    $value = getenv($key);

    return $value === false || $value === '' ? $fallback : $value;
}

return [
    'db_host' => config_env('IBNU_DB_HOST', 'localhost'),
    'db_name' => config_env('IBNU_DB_NAME', ''),
    'db_user' => config_env('IBNU_DB_USER', ''),
    'db_pass' => config_env('IBNU_DB_PASS', ''),

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


    // Isi nilai asli hanya di hosting atau environment variable, jangan commit secret ke GitHub.
    'lynk_webhook_secret' => config_env('LYNK_WEBHOOK_SECRET'),
    'site_login_url' => config_env('SITE_LOGIN_URL', 'https://ibnucreative.com/login'),
    'site_public_url' => rtrim(config_env('SITE_PUBLIC_URL', 'https://ibnucreative.com'), '/'),
    'lynk_reset_existing_member_password' => config_env('LYNK_RESET_EXISTING_MEMBER_PASSWORD', 'false') === 'true',
    'lynk_send_credentials_email' => config_env('LYNK_SEND_CREDENTIALS_EMAIL', 'true') === 'true',
    'lynk_email_from' => config_env('LYNK_EMAIL_FROM', 'Ibnu Creative <noreply@ibnucreative.com>'),
    'lynk_product_class_map' => [],

    // Tripay dipakai untuk checkout dari menu Kelas Tersedia member.
    'tripay_merchant_code' => config_env('TRIPAY_MERCHANT_CODE'),
    'tripay_api_key' => config_env('TRIPAY_API_KEY'),
    'tripay_private_key' => config_env('TRIPAY_PRIVATE_KEY'),
    'tripay_is_production' => config_env('TRIPAY_IS_PRODUCTION', 'true') === 'true',
    'tripay_default_method' => config_env('TRIPAY_DEFAULT_METHOD', 'QRIS'),
    'tripay_default_customer_phone' => config_env('TRIPAY_DEFAULT_CUSTOMER_PHONE', '081234567890'),
    'tripay_expired_minutes' => (int) config_env('TRIPAY_EXPIRED_MINUTES', '1440'),
    'tripay_callback_url' => config_env('TRIPAY_CALLBACK_URL', 'https://ibnucreative.com/api/tripay-webhook'),
    'tripay_return_url' => config_env('TRIPAY_RETURN_URL', 'https://ibnucreative.com/member?menu=my-courses'),



    // Google OAuth untuk hosting biasa seperti Domainesia.
    // Redirect URI di Google Console:
    // https://domain-anda.com/api/google-callback
    'google_client_id' => config_env('GOOGLE_CLIENT_ID'),
    'google_client_secret' => config_env('GOOGLE_CLIENT_SECRET'),
    'google_redirect_url' => config_env('GOOGLE_REDIRECT_URL', 'https://ibnucreative.com/api/google-callback'),

    // Resend tetap bisa dipakai di hosting PHP selama outbound HTTPS diaktifkan host.
    'resend_api_key' => config_env('RESEND_API_KEY'),
    'resend_from_email' => config_env('RESEND_FROM_EMAIL', 'Ibnu Creative <noreply@ibnucreative.com>'),
];
