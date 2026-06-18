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

create or replace function public.create_planning_group(
  p_name text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
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

  insert into public.groups (name, access_token_hash)
  values (v_name, encode(extensions.digest(p_access_token, 'sha256'), 'hex'))
  returning id into v_group_id;

  return v_group_id;
end;
$function$;

create or replace function public.get_planning_group(
  p_group_uuid uuid,
  p_access_token text
)
returns table (id uuid, name text)
language sql
security definer
as $function$
  select groups.id, groups.name
  from public.groups
  where groups.id = p_group_uuid
    and (
      groups.access_token_hash is null
      or groups.access_token_hash = encode(extensions.digest(p_access_token, 'sha256'), 'hex')
    );
$function$;

create or replace function public.get_planning_availability(
  p_group_uuid uuid,
  p_access_token text
)
returns setof public.availability
language sql
security definer
as $function$
  select availability.*
  from public.availability
  where availability.group_uuid = p_group_uuid::text
    and exists (
      select 1
      from public.groups
      where groups.id = p_group_uuid
        and (
          groups.access_token_hash is null
          or groups.access_token_hash = encode(extensions.digest(p_access_token, 'sha256'), 'hex')
        )
    )
  order by availability.date;
$function$;

create or replace function public.get_planning_participants(
  p_group_uuid uuid,
  p_access_token text
)
returns table (id uuid, group_uuid uuid, display_name text)
language sql
security definer
as $function$
  select participants.id, participants.group_uuid, participants.display_name
  from public.participants
  where participants.group_uuid = p_group_uuid
    and exists (
      select 1
      from public.groups
      where groups.id = p_group_uuid
        and (
          groups.access_token_hash is null
          or groups.access_token_hash = encode(extensions.digest(p_access_token, 'sha256'), 'hex')
        )
    );
$function$;

create or replace function public.join_planning_group(
  p_group_uuid uuid,
  p_display_name text,
  p_edit_token text,
  p_access_token text
)
returns table (id uuid, display_name text)
language plpgsql
security definer
as $function$
declare
  v_name text := trim(p_display_name);
  v_hash text;
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(extensions.digest(p_access_token, 'sha256'), 'hex')
      )
  ) then
    raise exception 'El grupo no existe o la clave de invitación no es válida';
  end if;

  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'El nombre debe tener entre 1 y 40 caracteres';
  end if;

  if p_edit_token is null or char_length(p_edit_token) < 24 then
    raise exception 'Token de edición no válido';
  end if;

  v_hash := encode(extensions.digest(p_edit_token, 'sha256'), 'hex');

  insert into public.participants (group_uuid, display_name, edit_token_hash)
  values (p_group_uuid, v_name, v_hash)
  on conflict (group_uuid, edit_token_hash)
  do update set
    display_name = excluded.display_name,
    last_seen_at = now();

  return query
    select participants.id, participants.display_name
    from public.participants
    where participants.group_uuid = p_group_uuid
      and participants.edit_token_hash = v_hash;
end;
$function$;

create or replace function public.set_planning_availability(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_date date,
  p_status text
)
returns void
language plpgsql
security definer
as $function$
declare
  v_name text;
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(extensions.digest(p_access_token, 'sha256'), 'hex')
      )
  ) then
    raise exception 'La clave de invitación no es válida';
  end if;

  select display_name into v_name
  from public.participants
  where id = p_participant_id
    and group_uuid = p_group_uuid
    and edit_token_hash = encode(extensions.digest(p_edit_token, 'sha256'), 'hex');

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
$function$;

create or replace function public.set_planning_availability_range(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_start_date date,
  p_end_date date,
  p_status text
)
returns void
language plpgsql
security definer
as $function$
declare
  v_day date;
begin
  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 62
  then
    raise exception 'El rango debe contener entre 1 y 63 días';
  end if;

  for v_day in
    select generate_series(p_start_date, p_end_date, interval '1 day')::date
  loop
    perform public.set_planning_availability(
      p_group_uuid,
      p_participant_id,
      p_edit_token,
      p_access_token,
      v_day,
      p_status
    );
  end loop;
end;
$function$;

revoke all on function public.create_planning_group(text, text) from public;
revoke all on function public.get_planning_group(uuid, text) from public;
revoke all on function public.get_planning_availability(uuid, text) from public;
revoke all on function public.get_planning_participants(uuid, text) from public;
revoke all on function public.join_planning_group(uuid, text, text, text) from public;
revoke all on function public.set_planning_availability(uuid, uuid, text, text, date, text) from public;
revoke all on function public.set_planning_availability_range(uuid, uuid, text, text, date, date, text) from public;

grant execute on function public.create_planning_group(text, text) to anon, authenticated;
grant execute on function public.get_planning_group(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_availability(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_participants(uuid, text) to anon, authenticated;
grant execute on function public.join_planning_group(uuid, text, text, text) to anon, authenticated;
grant execute on function public.set_planning_availability(uuid, uuid, text, text, date, text) to anon, authenticated;
grant execute on function public.set_planning_availability_range(uuid, uuid, text, text, date, date, text) to anon, authenticated;
