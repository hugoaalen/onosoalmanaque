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

do $$
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
$$;

alter table public.participant_preferences enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_votes enable row level security;

revoke all on public.participant_preferences from anon, authenticated;
revoke all on public.proposals from anon, authenticated;
revoke all on public.proposal_votes from anon, authenticated;

alter table public.availability
  drop constraint if exists availability_status_check;

alter table public.availability
  add constraint availability_status_check
  check (status in ('preferred', 'available', 'maybe', 'unavailable'));

create or replace function public.prevent_finalized_availability_changes()
returns trigger
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
$function$
language plpgsql
set search_path to public, extensions;

drop trigger if exists availability_locked_after_finalization
  on public.availability;

create trigger availability_locked_after_finalization
before insert or update or delete on public.availability
for each row execute function public.prevent_finalized_availability_changes();

create or replace function public.set_planning_availability(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_date date,
  p_status text
)
returns void
as $function$
declare
  v_name text;
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id is null
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
      )
  ) then
    raise exception 'El calendario está cerrado o la invitación no es válida';
  end if;

  select display_name into v_name
  from public.participants
  where id = p_participant_id
    and group_uuid = p_group_uuid
    and edit_token_hash = encode(digest(p_edit_token, 'sha256'), 'hex');

  if v_name is null then
    raise exception 'No tienes permiso para editar esta disponibilidad';
  end if;

  if p_status is null then
    delete from public.availability
    where group_uuid = p_group_uuid::text
      and participant_id = p_participant_id
      and date = p_date;
    return;
  end if;

  if p_status not in ('preferred', 'available', 'maybe', 'unavailable') then
    raise exception 'Estado de disponibilidad no válido';
  end if;

  insert into public.availability (
    group_uuid,
    participant_id,
    user_name,
    date,
    status
  )
  values (
    p_group_uuid::text,
    p_participant_id,
    v_name,
    p_date,
    p_status
  )
  on conflict (group_uuid, participant_id, date)
    where participant_id is not null
  do update set
    user_name = excluded.user_name,
    status = excluded.status;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

drop function if exists public.create_planning_group(text, text);

create function public.create_planning_group(
  p_name text,
  p_access_token text,
  p_admin_token text
)
returns uuid
as $function$
declare
  v_group_id uuid;
  v_name text := trim(p_name);
begin
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres';
  end if;

  if p_access_token is null or char_length(p_access_token) < 24 then
    raise exception 'Token de acceso no válido';
  end if;

  if p_admin_token is null or char_length(p_admin_token) < 24 then
    raise exception 'Token de administrador no válido';
  end if;

  insert into public.groups (name, access_token_hash, admin_token_hash)
  values (
    v_name,
    encode(digest(p_access_token, 'sha256'), 'hex'),
    encode(digest(p_admin_token, 'sha256'), 'hex')
  )
  returning id into v_group_id;

  return v_group_id;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

drop function if exists public.get_planning_group(uuid, text);

create function public.get_planning_group(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  id uuid,
  name text,
  finalized_proposal_id uuid
)
as $function$
  select groups.id, groups.name, groups.finalized_proposal_id
  from public.groups
  where groups.id = p_group_uuid
    and (
      groups.access_token_hash is null
      or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
    );
$function$
language sql
stable
security definer
set search_path to public, extensions;

create or replace function public.is_planning_admin(
  p_group_uuid uuid,
  p_admin_token text
)
returns boolean
as $function$
  select exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.admin_token_hash is not null
      and groups.admin_token_hash = encode(digest(p_admin_token, 'sha256'), 'hex')
  );
$function$
language sql
stable
security definer
set search_path to public, extensions;

create or replace function public.get_planning_preferences(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  participant_id uuid,
  group_uuid uuid,
  preferred_max_days integer,
  budget_eur integer,
  origin text,
  notes text
)
as $function$
  select
    preferences.participant_id,
    preferences.group_uuid,
    preferences.preferred_max_days,
    preferences.budget_eur,
    preferences.origin,
    preferences.notes
  from public.participant_preferences preferences
  where preferences.group_uuid = p_group_uuid
    and exists (
      select 1
      from public.groups
      where groups.id = p_group_uuid
        and (
          groups.access_token_hash is null
          or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
        )
    );
$function$
language sql
stable
security definer
set search_path to public, extensions;

create or replace function public.set_planning_preferences(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_preferred_max_days integer,
  p_budget_eur integer,
  p_origin text,
  p_notes text
)
returns void
as $function$
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
      )
  ) then
    raise exception 'La clave de invitación no es válida';
  end if;

  if not exists (
    select 1
    from public.participants
    where participants.id = p_participant_id
      and participants.group_uuid = p_group_uuid
      and participants.edit_token_hash = encode(digest(p_edit_token, 'sha256'), 'hex')
  ) then
    raise exception 'No tienes permiso para editar estas preferencias';
  end if;

  insert into public.participant_preferences (
    participant_id,
    group_uuid,
    preferred_max_days,
    budget_eur,
    origin,
    notes
  )
  values (
    p_participant_id,
    p_group_uuid,
    p_preferred_max_days,
    p_budget_eur,
    nullif(trim(p_origin), ''),
    nullif(trim(p_notes), '')
  )
  on conflict (participant_id)
  do update set
    preferred_max_days = excluded.preferred_max_days,
    budget_eur = excluded.budget_eur,
    origin = excluded.origin,
    notes = excluded.notes,
    updated_at = now();
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

create or replace function public.get_planning_proposals(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  id uuid,
  group_uuid uuid,
  title text,
  start_date date,
  end_date date,
  note text,
  created_at timestamptz,
  vote_count bigint
)
as $function$
  select
    proposals.id,
    proposals.group_uuid,
    proposals.title,
    proposals.start_date,
    proposals.end_date,
    proposals.note,
    proposals.created_at,
    count(proposal_votes.participant_id) as vote_count
  from public.proposals
  left join public.proposal_votes
    on proposal_votes.proposal_id = proposals.id
  where proposals.group_uuid = p_group_uuid
    and exists (
      select 1
      from public.groups
      where groups.id = p_group_uuid
        and (
          groups.access_token_hash is null
          or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
        )
    )
  group by proposals.id
  order by vote_count desc, proposals.start_date, proposals.created_at;
$function$
language sql
stable
security definer
set search_path to public, extensions;

create or replace function public.get_planning_votes(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  proposal_id uuid,
  participant_id uuid
)
as $function$
  select proposal_votes.proposal_id, proposal_votes.participant_id
  from public.proposal_votes
  where proposal_votes.group_uuid = p_group_uuid
    and exists (
      select 1
      from public.groups
      where groups.id = p_group_uuid
        and (
          groups.access_token_hash is null
          or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
        )
    );
$function$
language sql
stable
security definer
set search_path to public, extensions;

create or replace function public.create_planning_proposal(
  p_group_uuid uuid,
  p_admin_token text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_note text
)
returns uuid
as $function$
declare
  v_proposal_id uuid;
  v_title text := trim(p_title);
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede crear propuestas';
  end if;

  if exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id is not null
  ) then
    raise exception 'El viaje ya tiene una fecha final';
  end if;

  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'El título debe tener entre 1 y 80 caracteres';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 62
  then
    raise exception 'La propuesta debe contener entre 1 y 63 días';
  end if;

  insert into public.proposals (group_uuid, title, start_date, end_date, note)
  values (
    p_group_uuid,
    v_title,
    p_start_date,
    p_end_date,
    nullif(trim(p_note), '')
  )
  returning id into v_proposal_id;

  return v_proposal_id;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

create or replace function public.delete_planning_proposal(
  p_group_uuid uuid,
  p_admin_token text,
  p_proposal_id uuid
)
returns void
as $function$
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede eliminar propuestas';
  end if;

  if exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id = p_proposal_id
  ) then
    raise exception 'No se puede eliminar la propuesta final';
  end if;

  delete from public.proposals
  where proposals.id = p_proposal_id
    and proposals.group_uuid = p_group_uuid;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

create or replace function public.toggle_planning_vote(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_proposal_id uuid
)
returns boolean
as $function$
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id is null
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(digest(p_access_token, 'sha256'), 'hex')
      )
  ) then
    raise exception 'La votación está cerrada o la invitación no es válida';
  end if;

  if not exists (
    select 1
    from public.participants
    where participants.id = p_participant_id
      and participants.group_uuid = p_group_uuid
      and participants.edit_token_hash = encode(digest(p_edit_token, 'sha256'), 'hex')
  ) then
    raise exception 'No tienes permiso para votar';
  end if;

  if not exists (
    select 1
    from public.proposals
    where proposals.id = p_proposal_id
      and proposals.group_uuid = p_group_uuid
  ) then
    raise exception 'La propuesta no existe';
  end if;

  if exists (
    select 1
    from public.proposal_votes
    where proposal_votes.proposal_id = p_proposal_id
      and proposal_votes.participant_id = p_participant_id
  ) then
    delete from public.proposal_votes
    where proposal_votes.proposal_id = p_proposal_id
      and proposal_votes.participant_id = p_participant_id;
    return false;
  end if;

  insert into public.proposal_votes (proposal_id, participant_id, group_uuid)
  values (p_proposal_id, p_participant_id, p_group_uuid);
  return true;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

create or replace function public.finalize_planning_proposal(
  p_group_uuid uuid,
  p_admin_token text,
  p_proposal_id uuid
)
returns void
as $function$
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede cerrar la votación';
  end if;

  if not exists (
    select 1
    from public.proposals
    where proposals.id = p_proposal_id
      and proposals.group_uuid = p_group_uuid
  ) then
    raise exception 'La propuesta no existe';
  end if;

  update public.groups
  set finalized_proposal_id = p_proposal_id
  where groups.id = p_group_uuid;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

create or replace function public.reopen_planning_vote(
  p_group_uuid uuid,
  p_admin_token text
)
returns void
as $function$
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede reabrir la votación';
  end if;

  update public.groups
  set finalized_proposal_id = null
  where groups.id = p_group_uuid;
end;
$function$
language plpgsql
security definer
set search_path to public, extensions;

revoke all on function public.create_planning_group(text, text, text) from public;
revoke all on function public.get_planning_group(uuid, text) from public;
revoke all on function public.is_planning_admin(uuid, text) from public;
revoke all on function public.get_planning_preferences(uuid, text) from public;
revoke all on function public.set_planning_preferences(uuid, uuid, text, text, integer, integer, text, text) from public;
revoke all on function public.get_planning_proposals(uuid, text) from public;
revoke all on function public.get_planning_votes(uuid, text) from public;
revoke all on function public.create_planning_proposal(uuid, text, text, date, date, text) from public;
revoke all on function public.delete_planning_proposal(uuid, text, uuid) from public;
revoke all on function public.toggle_planning_vote(uuid, uuid, text, text, uuid) from public;
revoke all on function public.finalize_planning_proposal(uuid, text, uuid) from public;
revoke all on function public.reopen_planning_vote(uuid, text) from public;

grant execute on function public.create_planning_group(text, text, text) to anon, authenticated;
grant execute on function public.get_planning_group(uuid, text) to anon, authenticated;
grant execute on function public.is_planning_admin(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_preferences(uuid, text) to anon, authenticated;
grant execute on function public.set_planning_preferences(uuid, uuid, text, text, integer, integer, text, text) to anon, authenticated;
grant execute on function public.get_planning_proposals(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_votes(uuid, text) to anon, authenticated;
grant execute on function public.create_planning_proposal(uuid, text, text, date, date, text) to anon, authenticated;
grant execute on function public.delete_planning_proposal(uuid, text, uuid) to anon, authenticated;
grant execute on function public.toggle_planning_vote(uuid, uuid, text, text, uuid) to anon, authenticated;
grant execute on function public.finalize_planning_proposal(uuid, text, uuid) to anon, authenticated;
grant execute on function public.reopen_planning_vote(uuid, text) to anon, authenticated;
