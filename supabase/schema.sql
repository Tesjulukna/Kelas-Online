create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.accounts (
  id text primary key,
  role text not null check (role in ('admin', 'member')),
  name text not null,
  username text not null,
  email text not null default '',
  phone text not null default '',
  status text not null default 'Aktif',
  avatar text not null default '',
  allowed_class_ids jsonb,
  password_hash text not null,
  joined_at text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, username)
);

create table if not exists public.classes (
  id text primary key,
  title text not null,
  description text not null default '',
  students integer not null default 0,
  display_students integer,
  rating numeric(2,1),
  status text not null default 'Aktif',
  revenue text not null default 'Rp 0',
  price integer not null default 0,
  sale_price integer not null default 0,
  purchase_button_label text not null default 'Beli Sekarang',
  register_button_label text not null default 'Daftar',
  lynk_product_key text not null default '',
  tripay_product_key text not null default '',
  thumbnail text not null default '',
  mentor text not null default 'Ibnu Creative',
  progress integer not null default 0,
  next_label text not null default 'Lanjutkan modul berikutnya',
  live_at text not null default 'Jadwal menyusul',
  lessons text not null default '0 materi',
  show_on_homepage boolean not null default true,
  show_on_member boolean not null default true,
  highlighted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digital_products (
  id text primary key,
  title text not null,
  description text not null default '',
  price integer not null default 0,
  display_sales integer,
  rating numeric(2,1),
  status text not null default 'Draft',
  thumbnail text not null default '',
  add_video boolean not null default false,
  video_url text not null default '',
  file_url text not null default '',
  file_name text not null default '',
  delivery_note text not null default '',
  platform_type text not null default 'upload',
  pay_what_you_want boolean not null default false,
  sale_price integer not null default 0,
  item_quantity_enabled boolean not null default false,
  item_quantity integer not null default 0,
  limit_qty_per_checkout boolean not null default false,
  purchase_button_label text not null default 'Buy Now',
  release_time_enabled boolean not null default false,
  release_time text not null default '',
  whatsapp_notification boolean not null default false,
  custom_message_enabled boolean not null default false,
  custom_message text not null default '',
  reviews jsonb not null default '[]'::jsonb,
  add_ons jsonb not null default '[]'::jsonb,
  customer_questions jsonb not null default '[]'::jsonb,
  block_layout text not null default 'default',
  require_customer_name boolean not null default false,
  require_customer_phone boolean not null default false,
  lynk_product_key text not null default '',
  tripay_product_key text not null default '',
  show_on_homepage boolean not null default true,
  show_on_member boolean not null default true,
  highlighted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digital_product_access (
  id text primary key,
  product_id text not null,
  product_title text not null default '',
  member_id text not null default '',
  buyer_name text not null default '',
  buyer_email text not null default '',
  source text not null default '',
  order_id text not null default '',
  status text not null default 'active',
  download_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.digital_products add column if not exists add_video boolean not null default false;
alter table public.digital_products add column if not exists display_sales integer;
alter table public.digital_products add column if not exists rating numeric(2,1);
alter table public.digital_products add column if not exists video_url text not null default '';
alter table public.digital_products add column if not exists platform_type text not null default 'upload';
alter table public.digital_products add column if not exists pay_what_you_want boolean not null default false;
alter table public.digital_products add column if not exists sale_price integer not null default 0;
alter table public.digital_products add column if not exists item_quantity_enabled boolean not null default false;
alter table public.digital_products add column if not exists item_quantity integer not null default 0;
alter table public.digital_products add column if not exists limit_qty_per_checkout boolean not null default false;
alter table public.digital_products add column if not exists purchase_button_label text not null default 'Buy Now';
alter table public.digital_products add column if not exists release_time_enabled boolean not null default false;
alter table public.digital_products add column if not exists release_time text not null default '';
alter table public.digital_products add column if not exists whatsapp_notification boolean not null default false;
alter table public.digital_products add column if not exists custom_message_enabled boolean not null default false;
alter table public.digital_products add column if not exists custom_message text not null default '';
alter table public.digital_products add column if not exists reviews jsonb not null default '[]'::jsonb;
alter table public.digital_products add column if not exists add_ons jsonb not null default '[]'::jsonb;
alter table public.digital_products add column if not exists customer_questions jsonb not null default '[]'::jsonb;
alter table public.digital_products add column if not exists block_layout text not null default 'default';
alter table public.digital_products add column if not exists require_customer_name boolean not null default false;
alter table public.digital_products add column if not exists require_customer_phone boolean not null default false;
alter table public.digital_products add column if not exists show_on_homepage boolean not null default true;
alter table public.digital_products add column if not exists show_on_member boolean not null default true;
alter table public.digital_products add column if not exists highlighted boolean not null default false;

create table if not exists public.materials (
  id text primary key,
  class_id text not null references public.classes(id) on delete cascade,
  sort_order integer not null default 1,
  title text not null,
  description text,
  video_url text,
  video_file text not null default '',
  video_name text not null default '',
  video_type text not null default '',
  image_file text not null default '',
  image_name text not null default '',
  pdf_file text not null default '',
  pdf_name text not null default '',
  resource_links jsonb,
  requires_task boolean not null default false,
  allow_task_image boolean not null default true,
  require_task_image boolean not null default false,
  task_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.materials
  add column if not exists image_file text not null default '';

alter table public.materials
  add column if not exists image_name text not null default '';

alter table public.accounts
  add column if not exists phone text not null default '';

create table if not exists public.material_assets (
  id text primary key,
  material_id text not null references public.materials(id) on delete cascade,
  sort_order integer not null default 1,
  title text not null,
  image text not null default '',
  prompt text,
  instruction text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.material_assets
  add column if not exists instruction text not null default '';

create table if not exists public.auth_sessions (
  id text primary key,
  account_id text not null,
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique,
  user_agent text not null default '',
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.login_attempts (
  attempt_key text primary key,
  attempts integer not null default 0,
  last_attempt_at timestamptz not null,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id text primary key,
  member_id text not null default '',
  member_name text not null default 'Member',
  subject text not null default 'Bantuan mentor',
  message text not null,
  status text not null default 'Menunggu',
  priority text not null default 'Normal',
  answer text not null default '',
  replies jsonb,
  created_at text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id text primary key,
  member_id text not null,
  member_name text not null default 'Member',
  class_id text not null default '',
  class_title text not null default '',
  material_id text not null default '',
  material_title text not null default '',
  answer text not null,
  attachment_url text not null default '',
  attachment_name text not null default '',
  status text not null default 'Menunggu Review',
  feedback text not null default '',
  rating integer not null default 0,
  submitted_at text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id text primary key,
  member_id text not null default '',
  member_name text not null default '',
  member_avatar text not null default '',
  class_id text not null default '',
  class_title text not null default '',
  message text not null default '',
  status text not null default 'pending',
  created_at text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.member_progress (
  member_id text not null,
  class_id text not null,
  class_title text not null default '',
  material_id text not null default '',
  material_title text not null default '',
  material_index integer not null default 0,
  material_count integer not null default 0,
  progress_percent integer not null default 0,
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member_id, class_id)
);

create table if not exists public.lynk_orders (
  id text primary key,
  event_id text not null default '',
  order_id text not null default '',
  buyer_name text not null default '',
  buyer_email text not null default '',
  product_key text not null default '',
  product_name text not null default '',
  class_ids jsonb,
  member_id text not null default '',
  username text not null default '',
  password_created boolean not null default false,
  status text not null default 'processed',
  payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create table if not exists public.tripay_orders (
  id text primary key,
  merchant_ref text not null default '',
  reference text not null default '',
  member_id text not null default '',
  buyer_name text not null default '',
  buyer_email text not null default '',
  class_id text not null default '',
  class_title text not null default '',
  amount integer not null default 0,
  status text not null default 'pending',
  checkout_url text not null default '',
  access_granted boolean not null default false,
  payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_ref)
);

create table if not exists public.payment_snapshots (
  id text primary key,
  source text not null default 'legacy_access',
  source_label text not null default 'Akses lama',
  order_code text not null default '',
  buyer_name text not null default '',
  buyer_email text not null default '',
  member_id text not null default '',
  class_id text not null default '',
  class_title text not null default '',
  product_id text not null default '',
  product_title text not null default '',
  item_type text not null default 'class',
  amount integer not null default 0,
  status text not null default 'paid',
  payment_method text not null default 'Akses kelas',
  access_granted boolean not null default true,
  created_at text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists accounts_role_index on public.accounts(role);
create index if not exists accounts_email_index on public.accounts(role, email);
create index if not exists materials_class_index on public.materials(class_id);
create index if not exists material_assets_material_index on public.material_assets(material_id);
create index if not exists auth_session_expiry_index on public.auth_sessions(expires_at);
create index if not exists login_attempt_block_index on public.login_attempts(blocked_until);
create index if not exists support_member_index on public.support_tickets(member_id);
create index if not exists submission_member_index on public.submissions(member_id);
create index if not exists submission_material_index on public.submissions(material_id);
create index if not exists testimonial_status_index on public.testimonials(status);
create index if not exists testimonial_member_index on public.testimonials(member_id);
create index if not exists testimonial_class_index on public.testimonials(class_id);
create index if not exists member_progress_activity_index on public.member_progress(last_activity_at);
create index if not exists lynk_order_email_index on public.lynk_orders(buyer_email);
create index if not exists tripay_order_reference_index on public.tripay_orders(reference);
create index if not exists tripay_order_member_index on public.tripay_orders(member_id);
create index if not exists tripay_order_class_index on public.tripay_orders(class_id);
create index if not exists payment_snapshot_member_index on public.payment_snapshots(member_id);
create index if not exists payment_snapshot_class_index on public.payment_snapshots(class_id);
create index if not exists payment_snapshot_product_index on public.payment_snapshots(product_id);
create index if not exists digital_product_access_member_index on public.digital_product_access(member_id);
create index if not exists digital_product_access_email_index on public.digital_product_access(buyer_email);
create index if not exists digital_product_access_product_index on public.digital_product_access(product_id);

alter table public.classes add column if not exists price integer not null default 0;
alter table public.classes add column if not exists sale_price integer not null default 0;
alter table public.classes add column if not exists purchase_button_label text not null default 'Beli Sekarang';
alter table public.classes add column if not exists register_button_label text not null default 'Daftar';
alter table public.classes add column if not exists description text not null default '';
alter table public.classes add column if not exists display_students integer;
alter table public.classes add column if not exists rating numeric(2,1);
alter table public.classes add column if not exists tripay_product_key text not null default '';
alter table public.classes add column if not exists show_on_homepage boolean not null default true;
alter table public.classes add column if not exists show_on_member boolean not null default true;
alter table public.classes add column if not exists highlighted boolean not null default false;

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at before update on public.accounts
for each row execute function public.set_updated_at();

drop trigger if exists classes_updated_at on public.classes;
create trigger classes_updated_at before update on public.classes
for each row execute function public.set_updated_at();

drop trigger if exists digital_products_updated_at on public.digital_products;
create trigger digital_products_updated_at before update on public.digital_products
for each row execute function public.set_updated_at();

drop trigger if exists digital_product_access_updated_at on public.digital_product_access;
create trigger digital_product_access_updated_at before update on public.digital_product_access
for each row execute function public.set_updated_at();

drop trigger if exists materials_updated_at on public.materials;
create trigger materials_updated_at before update on public.materials
for each row execute function public.set_updated_at();

drop trigger if exists material_assets_updated_at on public.material_assets;
create trigger material_assets_updated_at before update on public.material_assets
for each row execute function public.set_updated_at();

drop trigger if exists support_tickets_updated_at on public.support_tickets;
create trigger support_tickets_updated_at before update on public.support_tickets
for each row execute function public.set_updated_at();

drop trigger if exists submissions_updated_at on public.submissions;
create trigger submissions_updated_at before update on public.submissions
for each row execute function public.set_updated_at();

drop trigger if exists testimonials_updated_at on public.testimonials;
create trigger testimonials_updated_at before update on public.testimonials
for each row execute function public.set_updated_at();

drop trigger if exists member_progress_updated_at on public.member_progress;
create trigger member_progress_updated_at before update on public.member_progress
for each row execute function public.set_updated_at();

drop trigger if exists lynk_orders_updated_at on public.lynk_orders;
create trigger lynk_orders_updated_at before update on public.lynk_orders
for each row execute function public.set_updated_at();

drop trigger if exists tripay_orders_updated_at on public.tripay_orders;
create trigger tripay_orders_updated_at before update on public.tripay_orders
for each row execute function public.set_updated_at();

drop trigger if exists payment_snapshots_updated_at on public.payment_snapshots;
create trigger payment_snapshots_updated_at before update on public.payment_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists login_attempts_updated_at on public.login_attempts;
create trigger login_attempts_updated_at before update on public.login_attempts
for each row execute function public.set_updated_at();

drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at before update on public.site_settings
for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.classes enable row level security;
alter table public.digital_products enable row level security;
alter table public.digital_product_access enable row level security;
alter table public.materials enable row level security;
alter table public.material_assets enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.support_tickets enable row level security;
alter table public.submissions enable row level security;
alter table public.testimonials enable row level security;
alter table public.member_progress enable row level security;
alter table public.lynk_orders enable row level security;
alter table public.tripay_orders enable row level security;
alter table public.payment_snapshots enable row level security;
alter table public.site_settings enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'ibnu-assets',
    'ibnu-assets',
    true,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
  ),
  (
    'ibnu-videos',
    'ibnu-videos',
    false,
    52428800,
    array['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.accounts (
  id,
  role,
  name,
  username,
  email,
  status,
  avatar,
  allowed_class_ids,
  password_hash,
  joined_at
)
values
  (
    'admin-1',
    'admin',
    'Admin IbnuCreative',
    'admin',
    'admin@ibnucreative.local',
    'Aktif',
    '',
    null,
    encode(digest('ibnucreative:admin123', 'sha256'), 'hex'),
    '2026-05-29'
  ),
  (
    'member-1',
    'member',
    'Sahabat Kreatif',
    'member',
    'member@ibnucreative.local',
    'Aktif',
    '',
    null,
    encode(digest('ibnucreative:member123', 'sha256'), 'hex'),
    '2026-05-29'
  )
on conflict do nothing;
