CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(120) PRIMARY KEY,
  role ENUM('admin', 'member') NOT NULL,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'Aktif',
  avatar MEDIUMTEXT,
  allowed_class_ids MEDIUMTEXT,
  password_hash VARCHAR(255) NOT NULL,
  joined_at VARCHAR(40) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_role_username (role, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materials (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_assets (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key VARCHAR(64) PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NOT NULL,
  blocked_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX login_attempt_block_index (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submissions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS member_progress (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lynk_orders (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tripay_orders (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  id VARCHAR(60) PRIMARY KEY,
  payload LONGTEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
