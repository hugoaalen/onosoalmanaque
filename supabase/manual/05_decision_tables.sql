alter table public.groups
  add column if not exists admin_token_hash text,
  add column if not exists finalized_proposal_id uuid;

create table if not exists public.participant_preferences (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  group_uuid uuid not null references public.groups(id) on delete cascade,
  preferred_max_days integer check (preferred_max_days between 1 and 60),
  budget_eur integer check (budget_eur between 0 and 100000),
  origin text check (char_length(origin) <= 80),
  notes text check (char_length(notes) <= 300),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  group_uuid uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  start_date date not null,
  end_date date not null,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 62)
);

create table if not exists public.proposal_votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  group_uuid uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (proposal_id, participant_id)
);

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_finalized_proposal_id_fkey'
  ) then
    alter table public.groups
      add constraint groups_finalized_proposal_id_fkey
      foreign key (finalized_proposal_id)
      references public.proposals(id)
      on delete set null;
  end if;
end;
$block$;

alter table public.participant_preferences enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_votes enable row level security;

revoke all on public.participant_preferences from anon, authenticated;
revoke all on public.proposals from anon, authenticated;
revoke all on public.proposal_votes from anon, authenticated;

create or replace function public.prevent_finalized_availability_changes()
returns trigger
language plpgsql
as $function$
declare
  v_group_uuid text;
begin
  if tg_op = 'DELETE' then
    v_group_uuid := old.group_uuid;
  else
    v_group_uuid := new.group_uuid;
  end if;

  if exists (
    select 1
    from public.groups
    where groups.id::text = v_group_uuid
      and groups.finalized_proposal_id is not null
  ) then
    raise exception 'El viaje ya tiene una fecha final y no admite más cambios';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

drop trigger if exists availability_locked_after_finalization
  on public.availability;

create trigger availability_locked_after_finalization
before insert or update or delete on public.availability
for each row execute function public.prevent_finalized_availability_changes();
