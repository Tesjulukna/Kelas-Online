CREATE TABLE IF NOT EXISTS accounts (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(120) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description LONGTEXT,
  students INT NOT NULL DEFAULT 0,
  display_students INT NULL,
  rating DECIMAL(2,1) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Aktif',
  revenue VARCHAR(80) NOT NULL DEFAULT 'Rp 0',
  price INT NOT NULL DEFAULT 0,
  sale_price INT NOT NULL DEFAULT 0,
  purchase_button_label VARCHAR(80) NOT NULL DEFAULT 'Beli Sekarang',
  register_button_label VARCHAR(80) NOT NULL DEFAULT 'Daftar',
  purchase_message LONGTEXT,
  lynk_product_key VARCHAR(180) NOT NULL DEFAULT '',
  tripay_product_key VARCHAR(180) NOT NULL DEFAULT '',
  thumbnail MEDIUMTEXT,
  mentor VARCHAR(120) NOT NULL DEFAULT 'Ibnu Creative',
  progress INT NOT NULL DEFAULT 0,
  next_label VARCHAR(160) NOT NULL DEFAULT 'Lanjutkan modul berikutnya',
  live_at VARCHAR(160) NOT NULL DEFAULT 'Jadwal menyusul',
  lessons VARCHAR(80) NOT NULL DEFAULT '0 materi',
  show_on_homepage TINYINT(1) NOT NULL DEFAULT 1,
  show_on_member TINYINT(1) NOT NULL DEFAULT 1,
  highlighted TINYINT(1) NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS class_discussions (
  id VARCHAR(120) PRIMARY KEY,
  class_id VARCHAR(120) NOT NULL,
  class_title VARCHAR(180) NOT NULL DEFAULT '',
  sender_id VARCHAR(120) NOT NULL DEFAULT '',
  sender_role VARCHAR(40) NOT NULL DEFAULT 'member',
  sender_name VARCHAR(160) NOT NULL DEFAULT '',
  sender_avatar MEDIUMTEXT NULL,
  message MEDIUMTEXT NOT NULL,
  created_at VARCHAR(60) NOT NULL DEFAULT '',
  INDEX class_discussion_class_index (class_id),
  INDEX class_discussion_sender_index (sender_id),
  INDEX class_discussion_created_index (created_at)
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
  email_sent TINYINT(1) NOT NULL DEFAULT 0,
  email_error VARCHAR(260) NOT NULL DEFAULT '',
  email_sent_at DATETIME NULL,
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

CREATE TABLE IF NOT EXISTS payment_snapshots (
  id VARCHAR(240) PRIMARY KEY,
  source VARCHAR(80) NOT NULL DEFAULT 'legacy_access',
  source_label VARCHAR(80) NOT NULL DEFAULT 'Akses lama',
  order_code VARCHAR(180) NOT NULL DEFAULT '',
  buyer_name VARCHAR(160) NOT NULL DEFAULT '',
  buyer_email VARCHAR(180) NOT NULL DEFAULT '',
  member_id VARCHAR(120) NOT NULL DEFAULT '',
  class_id VARCHAR(120) NOT NULL DEFAULT '',
  class_title VARCHAR(180) NOT NULL DEFAULT '',
  product_id VARCHAR(120) NOT NULL DEFAULT '',
  product_title VARCHAR(180) NOT NULL DEFAULT '',
  item_type VARCHAR(40) NOT NULL DEFAULT 'class',
  amount INT NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'paid',
  payment_method VARCHAR(80) NOT NULL DEFAULT 'Akses kelas',
  access_granted TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(60) NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX payment_snapshot_member_index (member_id),
  INDEX payment_snapshot_class_index (class_id),
  INDEX payment_snapshot_product_index (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_products (
  id VARCHAR(120) PRIMARY KEY,
  product_type VARCHAR(40) NOT NULL DEFAULT 'digital',
  title VARCHAR(180) NOT NULL,
  description LONGTEXT,
  price INT NOT NULL DEFAULT 0,
  display_sales INT NULL,
  rating DECIMAL(2,1) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Draft',
  thumbnail MEDIUMTEXT,
  add_video TINYINT(1) NOT NULL DEFAULT 0,
  video_url TEXT,
  file_url MEDIUMTEXT,
  file_name VARCHAR(220) NOT NULL DEFAULT '',
  delivery_note LONGTEXT,
  platform_type VARCHAR(60) NOT NULL DEFAULT 'upload',
  pay_what_you_want TINYINT(1) NOT NULL DEFAULT 0,
  sale_price INT NOT NULL DEFAULT 0,
  item_quantity_enabled TINYINT(1) NOT NULL DEFAULT 0,
  item_quantity INT NOT NULL DEFAULT 0,
  limit_qty_per_checkout TINYINT(1) NOT NULL DEFAULT 0,
  allow_repeat_purchase TINYINT(1) NOT NULL DEFAULT 0,
  purchase_button_label VARCHAR(80) NOT NULL DEFAULT 'Buy Now',
  release_time_enabled TINYINT(1) NOT NULL DEFAULT 0,
  release_time VARCHAR(120) NOT NULL DEFAULT '',
  whatsapp_notification TINYINT(1) NOT NULL DEFAULT 0,
  custom_message_enabled TINYINT(1) NOT NULL DEFAULT 0,
  custom_message LONGTEXT,
  reviews LONGTEXT,
  add_ons LONGTEXT,
  customer_questions LONGTEXT,
  block_layout VARCHAR(40) NOT NULL DEFAULT 'default',
  require_customer_name TINYINT(1) NOT NULL DEFAULT 0,
  require_customer_phone TINYINT(1) NOT NULL DEFAULT 0,
  auto_create_member TINYINT(1) NOT NULL DEFAULT 0,
  lynk_product_key VARCHAR(180) NOT NULL DEFAULT '',
  tripay_product_key VARCHAR(180) NOT NULL DEFAULT '',
  show_on_homepage TINYINT(1) NOT NULL DEFAULT 1,
  show_on_member TINYINT(1) NOT NULL DEFAULT 1,
  highlighted TINYINT(1) NOT NULL DEFAULT 0,
  prompt_content LONGTEXT,
  prompt_preview LONGTEXT,
  prompt_instructions LONGTEXT,
  prompt_examples LONGTEXT,
  prompt_license VARCHAR(120) NOT NULL DEFAULT 'Personal & commercial use',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX digital_product_status_index (status),
  INDEX digital_product_home_index (show_on_homepage),
  INDEX digital_product_member_index (show_on_member)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_product_access (
  id VARCHAR(160) PRIMARY KEY,
  product_id VARCHAR(120) NOT NULL DEFAULT '',
  product_title VARCHAR(180) NOT NULL DEFAULT '',
  member_id VARCHAR(120) NOT NULL DEFAULT '',
  buyer_name VARCHAR(160) NOT NULL DEFAULT '',
  buyer_email VARCHAR(180) NOT NULL DEFAULT '',
  source VARCHAR(80) NOT NULL DEFAULT '',
  order_id VARCHAR(180) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  download_url MEDIUMTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX digital_product_access_member_index (member_id),
  INDEX digital_product_access_email_index (buyer_email),
  INDEX digital_product_access_product_index (product_id),
  INDEX digital_product_access_order_index (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS testimonials (
  id VARCHAR(120) PRIMARY KEY,
  member_id VARCHAR(120) NOT NULL DEFAULT '',
  member_name VARCHAR(160) NOT NULL DEFAULT '',
  member_avatar MEDIUMTEXT,
  class_id VARCHAR(120) NOT NULL DEFAULT '',
  class_title VARCHAR(180) NOT NULL DEFAULT '',
  message LONGTEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  created_at VARCHAR(60) NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX testimonial_status_index (status),
  INDEX testimonial_member_index (member_id),
  INDEX testimonial_class_index (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificate_templates (
  id VARCHAR(120) PRIMARY KEY,
  class_id VARCHAR(120) NOT NULL DEFAULT '',
  name VARCHAR(180) NOT NULL DEFAULT 'Template Sertifikat',
  mentor_name VARCHAR(160) NOT NULL DEFAULT 'Ibnu Creative',
  size_type VARCHAR(60) NOT NULL DEFAULT 'a4Landscape',
  width INT NOT NULL DEFAULT 1123,
  height INT NOT NULL DEFAULT 794,
  payload LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX certificate_template_class_index (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificates (
  id VARCHAR(120) PRIMARY KEY,
  certificate_id VARCHAR(120) NOT NULL,
  member_id VARCHAR(120) NOT NULL DEFAULT '',
  member_name VARCHAR(160) NOT NULL DEFAULT '',
  class_id VARCHAR(120) NOT NULL DEFAULT '',
  class_title VARCHAR(180) NOT NULL DEFAULT '',
  mentor_name VARCHAR(160) NOT NULL DEFAULT 'Ibnu Creative',
  participant_name VARCHAR(160) NOT NULL DEFAULT '',
  template_id VARCHAR(120) NOT NULL DEFAULT '',
  template_snapshot LONGTEXT,
  completed_at VARCHAR(60) NOT NULL DEFAULT '',
  issued_at VARCHAR(60) NOT NULL DEFAULT '',
  name_change_used TINYINT(1) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  revoked_at VARCHAR(60) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY certificate_public_id_unique (certificate_id),
  UNIQUE KEY certificate_member_class_unique (member_id, class_id),
  INDEX certificate_member_index (member_id),
  INDEX certificate_class_index (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificate_name_change_requests (
  id VARCHAR(120) PRIMARY KEY,
  certificate_row_id VARCHAR(120) NOT NULL DEFAULT '',
  public_certificate_id VARCHAR(120) NOT NULL DEFAULT '',
  member_id VARCHAR(120) NOT NULL DEFAULT '',
  member_name VARCHAR(160) NOT NULL DEFAULT '',
  class_id VARCHAR(120) NOT NULL DEFAULT '',
  class_title VARCHAR(180) NOT NULL DEFAULT '',
  old_name VARCHAR(160) NOT NULL DEFAULT '',
  new_name VARCHAR(160) NOT NULL DEFAULT '',
  reason TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_at VARCHAR(60) NOT NULL DEFAULT '',
  created_at VARCHAR(60) NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY certificate_change_once_unique (certificate_row_id),
  INDEX certificate_change_status_index (status),
  INDEX certificate_change_member_index (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_events (
  id VARCHAR(160) PRIMARY KEY,
  event_type VARCHAR(40) NOT NULL DEFAULT 'view',
  visitor_id VARCHAR(160) NOT NULL DEFAULT '',
  session_id VARCHAR(160) NOT NULL DEFAULT '',
  member_id VARCHAR(120) NOT NULL DEFAULT '',
  member_role VARCHAR(40) NOT NULL DEFAULT 'public',
  page_path VARCHAR(300) NOT NULL DEFAULT '/',
  page_title VARCHAR(180) NOT NULL DEFAULT '',
  target_type VARCHAR(80) NOT NULL DEFAULT '',
  target_label VARCHAR(180) NOT NULL DEFAULT '',
  target_id VARCHAR(120) NOT NULL DEFAULT '',
  referrer TEXT,
  source VARCHAR(80) NOT NULL DEFAULT 'direct',
  source_label VARCHAR(120) NOT NULL DEFAULT 'Direct / Manual',
  country VARCHAR(80) NOT NULL DEFAULT 'Tidak diketahui',
  region VARCHAR(120) NOT NULL DEFAULT 'Tidak diketahui',
  city VARCHAR(120) NOT NULL DEFAULT 'Tidak diketahui',
  timezone VARCHAR(80) NOT NULL DEFAULT '',
  language VARCHAR(80) NOT NULL DEFAULT '',
  device_type VARCHAR(60) NOT NULL DEFAULT 'Tidak diketahui',
  browser VARCHAR(80) NOT NULL DEFAULT 'Tidak diketahui',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  ip_hash VARCHAR(80) NOT NULL DEFAULT '',
  metadata LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX analytics_event_created_index (created_at),
  INDEX analytics_event_type_index (event_type),
  INDEX analytics_event_visitor_index (visitor_id),
  INDEX analytics_event_source_index (source),
  INDEX analytics_event_location_index (country, region, city),
  INDEX analytics_event_page_index (page_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  id VARCHAR(60) PRIMARY KEY,
  payload LONGTEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
