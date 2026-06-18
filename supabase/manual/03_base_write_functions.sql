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
  values (
    v_name,
    encode(extensions.digest(p_access_token, 'sha256'), 'hex')
  )
  returning id into v_group_id;

  return v_group_id;
end;
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
        or groups.access_token_hash = encode(
          extensions.digest(p_access_token, 'sha256'),
          'hex'
        )
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

revoke all on function public.create_planning_group(text, text) from public;
revoke all on function public.join_planning_group(uuid, text, text, text) from public;

grant execute on function public.create_planning_group(text, text) to anon, authenticated;
grant execute on function public.join_planning_group(uuid, text, text, text) to anon, authenticated;
