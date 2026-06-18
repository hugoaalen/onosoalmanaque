create or replace function public.delete_planning_proposal(
  p_group_uuid uuid,
  p_admin_token text,
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
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
$function$;

revoke all on function public.delete_planning_proposal(uuid, text, uuid) from public;
grant execute on function public.delete_planning_proposal(uuid, text, uuid) to anon, authenticated;
