create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.groups
  add column if not exists access_token_hash text;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  group_uuid uuid not null references public.groups(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  edit_token_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (group_uuid, edit_token_hash)
);

create unique index if not exists participants_group_display_name_unique
  on public.participants (group_uuid, lower(display_name));

alter table public.availability
  add column if not exists participant_id uuid references public.participants(id) on delete cascade,
  add column if not exists status text not null default 'available';

alter table public.availability
  drop constraint if exists availability_status_check;

alter table public.availability
  add constraint availability_status_check
  check (status in ('preferred', 'available', 'maybe', 'unavailable'));

create unique index if not exists availability_participant_date_unique
  on public.availability (group_uuid, participant_id, date)
  where participant_id is not null;

alter table public.groups enable row level security;
alter table public.participants enable row level security;
alter table public.availability enable row level security;

revoke insert, update, delete on public.groups from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke insert, update, delete on public.availability from anon, authenticated;
revoke select on public.groups from anon, authenticated;
revoke select on public.availability from anon, authenticated;
