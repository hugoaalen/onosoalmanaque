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

revoke all on function public.is_planning_admin(uuid, text) from public;
grant execute on function public.is_planning_admin(uuid, text) to anon, authenticated;
