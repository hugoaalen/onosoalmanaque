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
language sql
security definer
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
          or groups.access_token_hash = encode(
            extensions.digest(p_access_token, 'sha256'),
            'hex'
          )
        )
    )
  group by proposals.id
  order by vote_count desc, proposals.start_date, proposals.created_at;
$function$;

create or replace function public.get_planning_votes(
  p_group_uuid uuid,
  p_access_token text
)
returns table (proposal_id uuid, participant_id uuid)
language sql
security definer
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
          or groups.access_token_hash = encode(
            extensions.digest(p_access_token, 'sha256'),
            'hex'
          )
        )
    );
$function$;

revoke all on function public.get_planning_proposals(uuid, text) from public;
revoke all on function public.get_planning_votes(uuid, text) from public;

grant execute on function public.get_planning_proposals(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_votes(uuid, text) to anon, authenticated;
