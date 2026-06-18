drop function if exists public.create_planning_group(text, text);

create function public.create_planning_group(
  p_name text,
  p_access_token text,
  p_admin_token text
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

  if p_admin_token is null or char_length(p_admin_token) < 24 then
    raise exception 'Token de administrador no válido';
  end if;

  insert into public.groups (name, access_token_hash, admin_token_hash)
  values (
    v_name,
    encode(extensions.digest(p_access_token, 'sha256'), 'hex'),
    encode(extensions.digest(p_admin_token, 'sha256'), 'hex')
  )
  returning id into v_group_id;

  return v_group_id;
end;
$function$;

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
language sql
security definer
as $function$
  select groups.id, groups.name, groups.finalized_proposal_id
  from public.groups
  where groups.id = p_group_uuid
    and (
      groups.access_token_hash is null
      or groups.access_token_hash = encode(
        extensions.digest(p_access_token, 'sha256'),
        'hex'
      )
    );
$function$;

create or replace function public.is_planning_admin(
  p_group_uuid uuid,
  p_admin_token text
)
returns boolean
language sql
security definer
as $function$
  select exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.admin_token_hash is not null
      and groups.admin_token_hash = encode(
        extensions.digest(p_admin_token, 'sha256'),
        'hex'
      )
  );
$function$;

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
language sql
security definer
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
          or groups.access_token_hash = encode(
            extensions.digest(p_access_token, 'sha256'),
            'hex'
          )
        )
    );
$function$;

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
language plpgsql
security definer
as $function$
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(
          extensions.digest(p_access_token, 'sha256'),
          'hex'
        )
      )
  ) then
    raise exception 'La clave de invitación no es válida';
  end if;

  if not exists (
    select 1
    from public.participants
    where participants.id = p_participant_id
      and participants.group_uuid = p_group_uuid
      and participants.edit_token_hash = encode(
        extensions.digest(p_edit_token, 'sha256'),
        'hex'
      )
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
$function$;

revoke all on function public.create_planning_group(text, text, text) from public;
revoke all on function public.get_planning_group(uuid, text) from public;
revoke all on function public.is_planning_admin(uuid, text) from public;
revoke all on function public.get_planning_preferences(uuid, text) from public;
revoke all on function public.set_planning_preferences(uuid, uuid, text, text, integer, integer, text, text) from public;

grant execute on function public.create_planning_group(text, text, text) to anon, authenticated;
grant execute on function public.get_planning_group(uuid, text) to anon, authenticated;
grant execute on function public.is_planning_admin(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_preferences(uuid, text) to anon, authenticated;
grant execute on function public.set_planning_preferences(uuid, uuid, text, text, integer, integer, text, text) to anon, authenticated;
