create or replace function public.toggle_planning_vote(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_proposal_id uuid
)
returns boolean
language plpgsql
security definer
as $function$
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id is null
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(
          extensions.digest(p_access_token, 'sha256'),
          'hex'
        )
      )
  ) then
    raise exception 'La votación está cerrada o la invitación no es válida';
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

  insert into public.proposal_votes (
    proposal_id,
    participant_id,
    group_uuid
  )
  values (
    p_proposal_id,
    p_participant_id,
    p_group_uuid
  );

  return true;
end;
$function$;

revoke all on function public.toggle_planning_vote(uuid, uuid, text, text, uuid) from public;
grant execute on function public.toggle_planning_vote(uuid, uuid, text, text, uuid) to anon, authenticated;
