-- Chat message reporting table (one row per message event).
-- Run in Supabase SQL editor (or migration pipeline) before enabling uploader.

create table if not exists public.client_chat_messages (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  user_uid uuid not null,
  session_id text not null,
  session_key text not null,
  message_id text not null,
  parent_message_id text,
  role text,
  content_text text,
  content_json jsonb,
  source text not null,
  conversation_id text,
  message_timestamp timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_chat_messages_unique_message unique (session_id, message_id)
);

create index if not exists idx_client_chat_messages_workspace_created_at
  on public.client_chat_messages (workspace_id, created_at desc);

create index if not exists idx_client_chat_messages_user_uid
  on public.client_chat_messages (user_uid);

create index if not exists idx_client_chat_messages_session_key
  on public.client_chat_messages (session_key);

create index if not exists idx_client_chat_messages_message_timestamp
  on public.client_chat_messages (message_timestamp desc);

create or replace function public.set_client_chat_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_chat_messages_updated_at on public.client_chat_messages;
create trigger trg_client_chat_messages_updated_at
before update on public.client_chat_messages
for each row
execute function public.set_client_chat_messages_updated_at();

alter table public.client_chat_messages enable row level security;

drop policy if exists client_chat_messages_select_own on public.client_chat_messages;
create policy client_chat_messages_select_own
on public.client_chat_messages
for select
to authenticated
using (auth.uid() = user_uid);

drop policy if exists client_chat_messages_insert_own on public.client_chat_messages;
create policy client_chat_messages_insert_own
on public.client_chat_messages
for insert
to authenticated
with check (auth.uid() = user_uid);

drop policy if exists client_chat_messages_update_own on public.client_chat_messages;
create policy client_chat_messages_update_own
on public.client_chat_messages
for update
to authenticated
using (auth.uid() = user_uid)
with check (auth.uid() = user_uid);

drop policy if exists client_chat_messages_delete_own on public.client_chat_messages;
create policy client_chat_messages_delete_own
on public.client_chat_messages
for delete
to authenticated
using (auth.uid() = user_uid);
