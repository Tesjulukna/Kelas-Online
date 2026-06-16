<?php

require __DIR__ . '/_bootstrap.php';

ensure_method(['GET', 'POST']);

$config = api_config();

if (empty($config['allow_install'])) {
    send_json(403, ['message' => 'Installer dimatikan di config.php.']);
}

$installSecret = clean_text($config['install_secret'] ?? '', 240);

if ($installSecret === '') {
    send_json(403, ['message' => 'Secret installer wajib diisi sebelum install.']);
}

$givenSecret = clean_text(
    $_SERVER['HTTP_X_INSTALL_SECRET'] ?? $_GET['secret'] ?? '',
    240,
);

if (!hash_equals($installSecret, $givenSecret)) {
    send_json(403, ['message' => 'Secret installer tidak valid.']);
}

$pdo = db();
$videoUploadDir = ensure_video_upload_dir();

$statements = [
    "CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(120) PRIMARY KEY,
        role ENUM('admin', 'member') NOT NULL,
        name VARCHAR(120) NOT NULL,
        username VARCHAR(80) NOT NULL,
        email VARCHAR(160) NOT NULL DEFAULT '',
        phone VARCHAR(40) NOT NULL DEFAULT '',
        status VARCHAR(40) NOT NULL DEFAULT 'Aktif',
        avatar MEDIUMTEXT,
        allowed_class_ids MEDIUMTEXT,
        password_hash VARCHAR(255) NOT NULL,
        joined_at VARCHAR(40) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_role_username (role, username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS classes (
        id VARCHAR(120) PRIMARY KEY,
        title VARCHAR(160) NOT NULL,
        students INT NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'Aktif',
        revenue VARCHAR(80) NOT NULL DEFAULT 'Rp 0',
        price INT NOT NULL DEFAULT 0,
        lynk_product_key VARCHAR(180) NOT NULL DEFAULT '',
        tripay_product_key VARCHAR(180) NOT NULL DEFAULT '',
        thumbnail MEDIUMTEXT,
        mentor VARCHAR(120) NOT NULL DEFAULT 'Ibnu Creative',
        progress INT NOT NULL DEFAULT 0,
        next_label VARCHAR(160) NOT NULL DEFAULT 'Lanjutkan modul berikutnya',
        live_at VARCHAR(160) NOT NULL DEFAULT 'Jadwal menyusul',
        lessons VARCHAR(80) NOT NULL DEFAULT '0 materi',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS materials (
        id VARCHAR(120) PRIMARY KEY,
        class_id VARCHAR(120) NOT NULL,
        sort_order INT NOT NULL DEFAULT 1,
        title VARCHAR(160) NOT NULL,
        description MEDIUMTEXT,
        video_url TEXT,
        video_file VARCHAR(180) NOT NULL DEFAULT '',
        video_name VARCHAR(180) NOT NULL DEFAULT '',
        video_type VARCHAR(80) NOT NULL DEFAULT '',
        image_file MEDIUMTEXT,
        image_name VARCHAR(180) NOT NULL DEFAULT '',
        pdf_file MEDIUMTEXT,
        pdf_name VARCHAR(180) NOT NULL DEFAULT '',
        resource_links MEDIUMTEXT,
        requires_task TINYINT(1) NOT NULL DEFAULT 0,
        allow_task_image TINYINT(1) NOT NULL DEFAULT 1,
        require_task_image TINYINT(1) NOT NULL DEFAULT 0,
        task_prompt LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX material_class_index (class_id),
        CONSTRAINT materials_class_fk
            FOREIGN KEY (class_id) REFERENCES classes(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(120) PRIMARY KEY,
        member_id VARCHAR(120) NOT NULL DEFAULT '',
        member_name VARCHAR(120) NOT NULL DEFAULT 'Member',
        subject VARCHAR(160) NOT NULL DEFAULT 'Bantuan mentor',
        message TEXT NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'Menunggu',
        priority VARCHAR(40) NOT NULL DEFAULT 'Normal',
        answer TEXT,
        replies MEDIUMTEXT,
        created_at VARCHAR(40) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX support_member_index (member_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS material_assets (
        id VARCHAR(120) PRIMARY KEY,
        material_id VARCHAR(120) NOT NULL,
        sort_order INT NOT NULL DEFAULT 1,
        title VARCHAR(160) NOT NULL,
        image MEDIUMTEXT,
        prompt LONGTEXT,
        instruction LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX material_asset_material_index (material_id),
        CONSTRAINT material_assets_material_fk
            FOREIGN KEY (material_id) REFERENCES materials(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS auth_sessions (
        id VARCHAR(120) PRIMARY KEY,
        account_id VARCHAR(120) NOT NULL,
        role ENUM('admin', 'member') NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        user_agent VARCHAR(255) NOT NULL DEFAULT '',
        expires_at DATETIME NOT NULL,
        last_seen_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY auth_session_token_unique (token_hash),
        INDEX auth_session_account_index (account_id, role),
        INDEX auth_session_expiry_index (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS login_attempts (
        attempt_key VARCHAR(64) PRIMARY KEY,
        attempts INT NOT NULL DEFAULT 0,
        last_attempt_at DATETIME NOT NULL,
        blocked_until DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX login_attempt_block_index (blocked_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS submissions (
        id VARCHAR(120) PRIMARY KEY,
        member_id VARCHAR(120) NOT NULL,
        member_name VARCHAR(120) NOT NULL DEFAULT 'Member',
        class_id VARCHAR(120) NOT NULL DEFAULT '',
        class_title VARCHAR(160) NOT NULL DEFAULT '',
        material_id VARCHAR(120) NOT NULL DEFAULT '',
        material_title VARCHAR(160) NOT NULL DEFAULT '',
        answer TEXT NOT NULL,
        attachment_url VARCHAR(240) NOT NULL DEFAULT '',
        attachment_name VARCHAR(180) NOT NULL DEFAULT '',
        status VARCHAR(40) NOT NULL DEFAULT 'Menunggu Review',
        feedback TEXT,
        rating TINYINT NOT NULL DEFAULT 0,
        submitted_at VARCHAR(40) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX submission_member_index (member_id),
        INDEX submission_material_index (material_id),
        INDEX submission_status_index (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS member_progress (
        member_id VARCHAR(120) NOT NULL,
        class_id VARCHAR(120) NOT NULL,
        class_title VARCHAR(160) NOT NULL DEFAULT '',
        material_id VARCHAR(120) NOT NULL DEFAULT '',
        material_title VARCHAR(160) NOT NULL DEFAULT '',
        material_index INT NOT NULL DEFAULT 0,
        material_count INT NOT NULL DEFAULT 0,
        progress_percent INT NOT NULL DEFAULT 0,
        last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (member_id, class_id),
        INDEX member_progress_member_index (member_id),
        INDEX member_progress_activity_index (last_activity_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS lynk_orders (
        id VARCHAR(120) PRIMARY KEY,
        event_id VARCHAR(180) NOT NULL DEFAULT '',
        order_id VARCHAR(180) NOT NULL DEFAULT '',
        buyer_name VARCHAR(160) NOT NULL DEFAULT '',
        buyer_email VARCHAR(180) NOT NULL DEFAULT '',
        product_key VARCHAR(240) NOT NULL DEFAULT '',
        product_name VARCHAR(240) NOT NULL DEFAULT '',
        class_ids MEDIUMTEXT,
        member_id VARCHAR(120) NOT NULL DEFAULT '',
        username VARCHAR(80) NOT NULL DEFAULT '',
        password_created TINYINT(1) NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'processed',
        payload MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY lynk_order_unique (order_id),
        INDEX lynk_order_email_index (buyer_email),
        INDEX lynk_order_member_index (member_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS tripay_orders (
        id VARCHAR(120) PRIMARY KEY,
        merchant_ref VARCHAR(180) NOT NULL DEFAULT '',
        reference VARCHAR(180) NOT NULL DEFAULT '',
        member_id VARCHAR(120) NOT NULL DEFAULT '',
        buyer_name VARCHAR(160) NOT NULL DEFAULT '',
        buyer_email VARCHAR(180) NOT NULL DEFAULT '',
        class_id VARCHAR(120) NOT NULL DEFAULT '',
        class_title VARCHAR(160) NOT NULL DEFAULT '',
        amount INT NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'pending',
        checkout_url MEDIUMTEXT,
        access_granted TINYINT(1) NOT NULL DEFAULT 0,
        payload MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY tripay_merchant_ref_unique (merchant_ref),
        INDEX tripay_reference_index (reference),
        INDEX tripay_member_index (member_id),
        INDEX tripay_class_index (class_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "CREATE TABLE IF NOT EXISTS site_settings (
        id VARCHAR(60) PRIMARY KEY,
        payload LONGTEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
];

foreach ($statements as $statement) {
    $pdo->exec($statement);
}

function ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    $query = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $query->execute([$column]);

    if (!$query->fetch()) {
        $pdo->exec("ALTER TABLE `$table` ADD `$column` $definition");
    }
}

function ensure_column_definition(PDO $pdo, string $table, string $definition): void
{
    try {
        $pdo->exec("ALTER TABLE `$table` MODIFY $definition");
    } catch (Throwable $error) {
        // Some free hosts block ALTER MODIFY; fresh installs still get the right schema.
    }
}

ensure_column($pdo, 'accounts', 'avatar', 'MEDIUMTEXT NULL AFTER status');
ensure_column($pdo, 'accounts', 'phone', "VARCHAR(40) NOT NULL DEFAULT '' AFTER email");
ensure_column($pdo, 'accounts', 'allowed_class_ids', 'MEDIUMTEXT NULL AFTER avatar');
ensure_column($pdo, 'classes', 'price', 'INT NOT NULL DEFAULT 0 AFTER revenue');
ensure_column($pdo, 'classes', 'lynk_product_key', "VARCHAR(180) NOT NULL DEFAULT '' AFTER revenue");
ensure_column($pdo, 'classes', 'tripay_product_key', "VARCHAR(180) NOT NULL DEFAULT '' AFTER lynk_product_key");
ensure_column($pdo, 'materials', 'video_file', "VARCHAR(180) NOT NULL DEFAULT '' AFTER video_url");
ensure_column($pdo, 'materials', 'description', 'MEDIUMTEXT NULL AFTER title');
ensure_column($pdo, 'materials', 'video_name', "VARCHAR(180) NOT NULL DEFAULT '' AFTER video_file");
ensure_column($pdo, 'materials', 'video_type', "VARCHAR(80) NOT NULL DEFAULT '' AFTER video_name");
ensure_column($pdo, 'materials', 'image_file', 'MEDIUMTEXT NULL AFTER video_type');
ensure_column($pdo, 'materials', 'image_name', "VARCHAR(180) NOT NULL DEFAULT '' AFTER image_file");
ensure_column($pdo, 'materials', 'pdf_file', 'MEDIUMTEXT NULL AFTER image_name');
ensure_column($pdo, 'materials', 'pdf_name', "VARCHAR(180) NOT NULL DEFAULT '' AFTER pdf_file");
ensure_column($pdo, 'materials', 'resource_links', 'MEDIUMTEXT NULL AFTER pdf_name');
ensure_column($pdo, 'materials', 'allow_task_image', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER requires_task');
ensure_column($pdo, 'materials', 'require_task_image', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_task_image');
ensure_column($pdo, 'material_assets', 'instruction', 'LONGTEXT NULL AFTER prompt');
ensure_column_definition($pdo, 'materials', 'task_prompt LONGTEXT NULL');
ensure_column_definition($pdo, 'material_assets', 'prompt LONGTEXT NULL');
ensure_column_definition($pdo, 'material_assets', 'instruction LONGTEXT NULL');
ensure_column($pdo, 'support_tickets', 'replies', 'MEDIUMTEXT NULL AFTER answer');
ensure_column($pdo, 'submissions', 'attachment_url', "VARCHAR(240) NOT NULL DEFAULT '' AFTER answer");
ensure_column($pdo, 'submissions', 'attachment_name', "VARCHAR(180) NOT NULL DEFAULT '' AFTER attachment_url");
ensure_column($pdo, 'submissions', 'rating', 'TINYINT NOT NULL DEFAULT 0 AFTER feedback');
ensure_column($pdo, 'lynk_orders', 'password_created', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER username');

$defaultAdminUsername = clean_username($config['default_admin_username'] ?? 'admin');
$defaultAdminPassword = (string) ($config['default_admin_password'] ?? 'admin123');
$defaultAdminName = clean_text($config['default_admin_name'] ?? 'Admin IbnuCreative', 100);
$defaultMemberPassword = (string) ($config['default_member_password'] ?? 'member123');

if (
    strlen($defaultAdminPassword) < 12 ||
    hash_equals($defaultAdminPassword, 'admin123')
) {
    send_json(400, [
        'message' => 'Password default admin wajib diganti dan minimal 12 karakter sebelum install.',
    ]);
}

if (
    strlen($defaultMemberPassword) < 8 ||
    hash_equals($defaultMemberPassword, 'member123')
) {
    send_json(400, [
        'message' => 'Password default member wajib diganti dan minimal 8 karakter sebelum install.',
    ]);
}

$adminQuery = $pdo->prepare(
    'SELECT id FROM accounts WHERE role = ? AND username = ? LIMIT 1',
);
$adminQuery->execute(['admin', $defaultAdminUsername]);
$existingAdmin = $adminQuery->fetch();

if ($existingAdmin) {
    if (!empty($config['install_reset_admin_password'])) {
        $updateAdmin = $pdo->prepare(
            'UPDATE accounts
            SET name = ?, status = ?, password_hash = ?
            WHERE id = ? AND role = ?',
        );
        $updateAdmin->execute([
            $defaultAdminName,
            'Aktif',
            hash_password_value($defaultAdminPassword),
            $existingAdmin['id'],
            'admin',
        ]);
    } else {
        $updateAdmin = $pdo->prepare(
            'UPDATE accounts SET name = ?, status = ? WHERE id = ? AND role = ?',
        );
        $updateAdmin->execute([
            $defaultAdminName,
            'Aktif',
            $existingAdmin['id'],
            'admin',
        ]);
    }
} else {
    $insertAdmin = $pdo->prepare(
        'INSERT INTO accounts
        (id, role, name, username, email, status, password_hash, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insertAdmin->execute([
        make_id('admin'),
        'admin',
        $defaultAdminName,
        $defaultAdminUsername,
        'admin@ibnucreative.local',
        'Aktif',
        hash_password_value($defaultAdminPassword),
        date('Y-m-d'),
    ]);
}

$memberCount = (int) $pdo
    ->query("SELECT COUNT(*) FROM accounts WHERE role = 'member'")
    ->fetchColumn();

if ($memberCount === 0) {
    $insertMember = $pdo->prepare(
        'INSERT INTO accounts
        (id, role, name, username, email, status, password_hash, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insertMember->execute([
        'member-1',
        'member',
        clean_text($config['default_member_name'] ?? 'Sahabat Kreatif', 100),
        clean_username($config['default_member_username'] ?? 'member'),
        'member@ibnucreative.local',
        'Aktif',
        hash_password_value($defaultMemberPassword),
        date('Y-m-d'),
    ]);
}

$classCount = (int) $pdo->query('SELECT COUNT(*) FROM classes')->fetchColumn();

if ($classCount === 0) {
    $seedClasses = [
        [
            'id' => 'admin-class-1',
            'title' => 'Batch Desain Konten',
            'students' => 128,
            'status' => 'Draft',
            'revenue' => 'Rp 38,4 jt',
            'progress' => 72,
            'lessons' => '16 materi',
        ],
        [
            'id' => 'admin-class-2',
            'title' => 'Intensif Video Editing',
            'students' => 96,
            'status' => 'Aktif',
            'revenue' => 'Rp 27,8 jt',
            'progress' => 46,
            'lessons' => '20 materi',
        ],
        [
            'id' => 'admin-class-3',
            'title' => 'Workshop Funnel',
            'students' => 54,
            'status' => 'Draft',
            'revenue' => 'Rp 12,1 jt',
            'progress' => 88,
            'lessons' => '24 materi',
        ],
    ];
    $insertClass = $pdo->prepare(
        'INSERT INTO classes
        (id, title, students, status, revenue, price, lynk_product_key, tripay_product_key, thumbnail, mentor, progress, next_label, live_at, lessons)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $insertMaterial = $pdo->prepare(
        'INSERT INTO materials
        (id, class_id, sort_order, title, video_url, video_file, video_name, video_type, requires_task, task_prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );

    foreach ($seedClasses as $index => $class) {
        $insertClass->execute([
            $class['id'],
            $class['title'],
            $class['students'],
            $class['status'],
            $class['revenue'],
            0,
            '',
            '',
            '',
            'Ibnu Creative',
            $class['progress'],
            'Lanjutkan modul berikutnya',
            'Jumat, 29 Mei 2026, 20.00 WITA',
            $class['lessons'],
        ]);
        $insertMaterial->execute([
            $class['id'] . '-material-1',
            $class['id'],
            1,
            'Pengenalan ' . $class['title'],
            'https://www.youtube.com/watch?v=ysz5S6PUM-U',
            '',
            '',
            '',
            0,
            'Kirim link tugas atau catatan praktik materi ini.',
        ]);
        $insertMaterial->execute([
            $class['id'] . '-material-2',
            $class['id'],
            2,
            'Praktik ' . $class['title'],
            'https://www.youtube.com/shorts/aqz-KE-bpKQ',
            '',
            '',
            '',
            1,
            'Kirim link hasil praktik atau catatan tugas dari materi ini.',
        ]);
    }
}

send_json(200, [
    'message' => 'Database siap. Matikan allow_install di config.php setelah ini.',
    'adminUsername' => clean_username($config['default_admin_username'] ?? 'admin'),
    'memberUsername' => clean_username($config['default_member_username'] ?? 'member'),
    'videoUploadDir' => str_replace('\\', '/', $videoUploadDir),
]);
