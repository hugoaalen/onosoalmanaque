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
returns table (id uuid, name text, finalized_proposal_id uuid)
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

revoke all on function public.create_planning_group(text, text, text) from public;
revoke all on function public.get_planning_group(uuid, text) from public;

grant execute on function public.create_planning_group(text, text, text) to anon, authenticated;
grant execute on function public.get_planning_group(uuid, text) to anon, authenticated;
