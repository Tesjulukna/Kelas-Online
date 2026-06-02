<?php

return [
    'db_host' => 'sql213.infinityfree.com',
    'db_name' => 'if0_41588815_db_ibnucreative',
    'db_user' => 'if0_41588815',
    'db_pass' => 'Kitaberdua2',

    'allow_install' => true,
    'max_video_upload_mb' => 80,
    'default_admin_name' => 'Admin IbnuCreative',
    'default_admin_username' => 'alta26',
    'default_admin_password' => '#Kitaberdua2',
    'default_member_name' => 'Sahabat Kreatif',
    'default_member_username' => 'member',
    'default_member_password' => 'member123',

    // Isi dengan Merchant Key dari halaman Webhook Lynk.id.
    // Setelah diisi, URL webhook cukup:
    // https://domain-anda.com/api/lynk-webhook.php
    'lynk_webhook_secret' => '83RD7Hor-zRn6EbhMicjUpgt6uBiucae',
    'site_login_url' => '',
    'lynk_reset_existing_member_password' => false,
    'lynk_send_credentials_email' => true,
    'lynk_email_from' => '',
    // Akun member hanya dibuat kalau produk Lynk cocok dengan:
    // 1. field "Kode produk Lynk.id" pada kelas di dashboard admin, atau
    // 2. mapping manual di bawah ini.
    // Produk Lynk lain seperti sepatu, merchandise, jasa, dll akan diabaikan.
    'lynk_product_class_map' => [
        // 'kode-produk-lynk-atau-nama-produk' => 'id-kelas-website',
    ],
];
