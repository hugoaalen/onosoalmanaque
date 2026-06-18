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
      or groups.access_token_hash = encode(
        extensions.digest(p_access_token, 'sha256'),
        'hex'
      )
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
          or groups.access_token_hash = encode(
            extensions.digest(p_access_token, 'sha256'),
            'hex'
          )
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
          or groups.access_token_hash = encode(
            extensions.digest(p_access_token, 'sha256'),
            'hex'
          )
        )
    );
$function$;

revoke all on function public.get_planning_group(uuid, text) from public;
revoke all on function public.get_planning_availability(uuid, text) from public;
revoke all on function public.get_planning_participants(uuid, text) from public;

grant execute on function public.get_planning_group(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_availability(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_participants(uuid, text) to anon, authenticated;
