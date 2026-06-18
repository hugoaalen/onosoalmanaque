create or replace function public.finalize_planning_proposal(
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
$function$;

create or replace function public.reopen_planning_vote(
  p_group_uuid uuid,
  p_admin_token text
)
returns void
language plpgsql
security definer
as $function$
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede reabrir la votación';
  end if;

  update public.groups
  set finalized_proposal_id = null
  where groups.id = p_group_uuid;
end;
$function$;

revoke all on function public.finalize_planning_proposal(uuid, text, uuid) from public;
revoke all on function public.reopen_planning_vote(uuid, text) from public;

grant execute on function public.finalize_planning_proposal(uuid, text, uuid) to anon, authenticated;
grant execute on function public.reopen_planning_vote(uuid, text) to anon, authenticated;
