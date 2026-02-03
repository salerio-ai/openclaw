-- =====================================================
-- OAuth 授权码表（一次性，短期有效）
-- =====================================================

create table if not exists oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),

  -- 授权码本体
  auth_code text not null unique,

  -- OAuth 客户端信息
  client_id text not null,               -- 如：openclaw-desktop
  redirect_uri text not null,             -- 回调地址（127.0.0.1:port）

  -- 绑定主体
  user_id uuid not null
    references auth.users(id) on delete cascade,
  workspace_id uuid not null
    references workspaces(id) on delete cascade,

  -- 设备 / 安全上下文
  device_id text,
  login_trace_id uuid,

  -- 使用状态
  used boolean not null default false,
  expires_at timestamptz not null,        -- 强烈建议 60s～120s

  -- 审计
  created_at timestamptz not null default now()
);

-- -------------------------
-- 索引（授权码校验关键路径）
-- -------------------------

create index if not exists idx_oauth_auth_codes_code
  on oauth_authorization_codes (auth_code);

create index if not exists idx_oauth_auth_codes_expires
  on oauth_authorization_codes (expires_at);

create index if not exists idx_oauth_auth_codes_user_workspace
  on oauth_authorization_codes (user_id, workspace_id);

-- -------------------------
-- 注释
-- -------------------------

comment on table oauth_authorization_codes is
'OAuth 授权码表：仅用于桌面端登录授权，一次性、短期有效';

comment on column oauth_authorization_codes.auth_code is
'一次性授权码，只能使用一次';

comment on column oauth_authorization_codes.client_id is
'OAuth 客户端标识，如 openclaw-desktop';

comment on column oauth_authorization_codes.redirect_uri is
'授权完成后回调的 redirect_uri，需严格校验';

comment on column oauth_authorization_codes.used is
'是否已被兑换为 token，true 表示不可再用';

comment on column oauth_authorization_codes.expires_at is
'授权码过期时间，通常为 now() + 60s';

-- -------------------------
-- RLS：禁止客户端直接访问
-- -------------------------

alter table oauth_authorization_codes enable row level security;

create policy "deny all access to oauth_authorization_codes"
on oauth_authorization_codes
for all
using (false);





-- =====================================================
-- OAuth Token 表（长期授权）
-- =====================================================

create table if not exists oauth_tokens (
  id uuid primary key default gen_random_uuid(),

  -- Token 本体
  access_token text not null unique,
  refresh_token text unique,

  -- 绑定主体
  user_id uuid not null
    references auth.users(id) on delete cascade,
  workspace_id uuid not null
    references workspaces(id) on delete cascade,
  client_id text not null,                -- openclaw-desktop

  -- 来源追溯（逻辑关联 auth_code）
  issued_from_auth_code text,

  -- 生命周期
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,

  -- 设备上下文
  device_id text,
  machine_id text,

  -- 状态控制
  revoked boolean not null default false,

  -- 审计
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- -------------------------
-- 索引（高频校验路径）
-- -------------------------

create index if not exists idx_oauth_tokens_access_token
  on oauth_tokens (access_token);

create index if not exists idx_oauth_tokens_refresh_token
  on oauth_tokens (refresh_token);

create index if not exists idx_oauth_tokens_user_workspace
  on oauth_tokens (user_id, workspace_id);

create index if not exists idx_oauth_tokens_client
  on oauth_tokens (client_id);

-- -------------------------
-- 注释
-- -------------------------

comment on table oauth_tokens is
'OAuth Token 表：存储 access_token / refresh_token，用于桌面端长期访问';

comment on column oauth_tokens.access_token is
'访问令牌，短期有效，用于 API / Skills 调用';

comment on column oauth_tokens.refresh_token is
'刷新令牌，用于换发新的 access_token';

comment on column oauth_tokens.issued_from_auth_code is
'生成该 token 时使用的 auth_code，仅用于审计追溯';

comment on column oauth_tokens.revoked is
'是否已被吊销，true 表示 token 无效';

-- -------------------------
-- RLS：禁止客户端直接访问
-- -------------------------

alter table oauth_tokens enable row level security;

create policy "deny all access to oauth_tokens"
on oauth_tokens
for all
using (false);
